import { compileHandlerChain } from "../compiler";
import { Context } from "../context";
import { HttpException } from "../http-exception";
import type { RouterAdapter } from "../router/adapter";
import type { Handler, Method, ServerRoute, } from "../types";
import { executeHandlers } from "./response";

// ── Trace Helper ─────────────────────────────────────────────────────────────
async function runTracePhase<T>(
  listeners: import("../types").TraceListener[] | undefined,
  phaseExecutor: () => Promise<T> | T
): Promise<T> {
  if (!listeners || listeners.length === 0) return phaseExecutor();

  const begin = performance.now();
  const onStopCallbacks: ((info: import("../types").TraceEventInfo) => void | Promise<void>)[] = [];

  const event: import("../types").TraceEvent = {
    begin,
    onStop: (cb) => onStopCallbacks.push(cb)
  };

  for (let i = 0; i < listeners.length; i++) {
    const r = listeners[i](event);
    if (r instanceof Promise) await r;
  }

  let error: Error | null = null;
  let result: T;
  try {
    result = await phaseExecutor();
    return result;
  } catch (err: unknown) {
    error = err instanceof Error ? err : new Error(String(err));
    throw err;
  } finally {
    const end = performance.now();
    for (let i = 0; i < onStopCallbacks.length; i++) {
      const r = onStopCallbacks[i]({ begin, end, error });
      if (r instanceof Promise) await r;
    }
  }
}

// Pre-allocated methods array for 405 detection (avoids allocation per 404)
const ALL_METHODS: Method[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

export function baseFetch(
  router: RouterAdapter<ServerRoute[]>,
  request: Request,
  method: Method,
  pathname: string,
  middlewares: Handler<Context>[],
  hooks: import("../types").Hooks,
  compiledCache: Map<string, (context: Context) => Promise<Response | undefined>>,
  envBindings?: Record<string, unknown>,
  executionCtx?: unknown,
  debug: boolean = false,
  aot: boolean = true
): Response | Promise<Response> {
  // ── Fast Path (No Hooks) ───────────────────────────────────────────────────
  if (hooks.onRequest.length === 0 && hooks.onBeforeHandle.length === 0 && hooks.onAfterHandle.length === 0 && hooks.onError.length === 0 && hooks.trace.length === 0) {
    const route = router.match(method, pathname);
    if (route?.matched) {
      const handlers = [...middlewares, ...route.middlewares, ...route.data];
      let executor: ((context: Context) => Promise<Response | undefined>) | undefined;
      
      if (aot) {
        executor = route.store?.executor as ((context: Context) => Promise<Response | undefined>) | undefined;
        if (!executor) {
          executor = compiledCache.get(method + route.matched_route);
          if (!executor) {
            executor = compileHandlerChain(handlers);
            if (route.store) route.store.executor = executor;
            compiledCache.set(method + route.matched_route, executor);
          }
        }
      }
      
      let context: Context | undefined = new Context(
        request, 
        envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as Record<string, unknown>), 
        { params: route.params }, 
        executionCtx,
        debug
      );

      const handleValue = (r: Response | undefined) => {
        const res = r || new Response("Not Found", { status: 404 });
        context!.finalResponse = res;
        const postProcessPromise = (function(ctx) {
          return executePostProcess(hooks, ctx);
        })(context!);
        if (executionCtx && typeof (executionCtx as Record<string, unknown>).waitUntil === "function") {
          ((executionCtx as Record<string, unknown>).waitUntil as (p: Promise<unknown> | unknown) => void)(postProcessPromise);
        } else {
          postProcessPromise.catch(console.error);
        }
        
        context = undefined;
        return res;
      };

      const resolveError = (error: unknown): Response => {
        if (error instanceof HttpException) return error.getResponse();
        console.error("Unhandled error:", error);
        
        const payload: Record<string, unknown> = { statusCode: 500, error: "Internal Server Error", message: "An unexpected error occurred" };
        if (debug) {
            payload.message = error instanceof Error ? error.message : String(error);
            payload.stack = error instanceof Error ? error.stack : undefined;
        }
        
        return new Response(
          JSON.stringify(payload),
          { status: 500, headers: { "Content-Type": "application/json; charset=UTF-8" } }
        );
      };

      try {
        let res: Response | Promise<Response | undefined> | undefined;
        if (aot) {
          res = executor!(context);
        } else {
          res = executeHandlers(context, handlers);
        }
        
        if (res instanceof Promise) {
          return res.then((r) => handleValue(r)).catch(error => handleValue(resolveError(error)));
        }
        return handleValue(res);
      } catch (error) {
        return handleValue(resolveError(error));
      }
    }
  }

  // ── Slow Path ──────────────────────────────────────────────────────────────
  return baseFetchSlow(router, request, method, pathname, middlewares, hooks, compiledCache, envBindings, executionCtx, debug);
}

async function baseFetchSlow(
  router: RouterAdapter<ServerRoute[]>,
  request: Request,
  method: Method,
  pathname: string,
  middlewares: Handler<Context>[],
  hooks: import("../types").Hooks,
  compiledCache: Map<string, (context: Context) => Promise<Response | undefined>>,
  envBindings?: Record<string, unknown>,
  executionCtx?: unknown,
  debug: boolean = false,
  aot: boolean = true
): Promise<Response> {
  let context: Context | undefined ;
  let response: Response | undefined;
  
  let traceApi: import("../types").TraceAPI<Context> | undefined;
  let traceListeners: Record<string, import("../types").TraceListener[]> | undefined;

  try {
    // ── 1. onRequest ──────────────────────────────────────────────────────────
    const onReqLen = hooks.onRequest.length;
    const hasTrace = hooks.trace.length > 0;
    
    if (onReqLen > 0 || hasTrace) {
      context = new Context(
        request, 
        envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as Record<string, unknown>), 
        { params: {} }, 
        executionCtx,
        debug
      );
      
      if (hasTrace) {
        traceListeners = { request: [], beforeHandle: [], handle: [], afterHandle: [], error: [], response: [] };
        traceApi = {
          context,
          onRequest: (cb) => traceListeners?.request.push(cb),
          onBeforeHandle: (cb) => traceListeners?.beforeHandle.push(cb),
          onHandle: (cb) => traceListeners?.handle.push(cb),
          onAfterHandle: (cb) => traceListeners?.afterHandle.push(cb),
          onError: (cb) => traceListeners?.error.push(cb),
          onResponse: (cb) => traceListeners?.response.push(cb),
        };
        for (let i = 0; i < hooks.trace.length; i++) {
          const r = hooks.trace[i](traceApi);
          if (r instanceof Promise) await r;
        }
      }
    }

    if (onReqLen > 0 || (traceListeners && traceListeners.request.length > 0)) {
      const executeOnRequest = async () => {
        for (let i = 0; i < onReqLen; i++) {
          const r = await hooks.onRequest[i](context!);
          if (r instanceof Response) return r; // short-circuit before routing
        }
      };
      const res = await runTracePhase(traceListeners?.request, executeOnRequest);
      if (res instanceof Response) return res;
    }

    // ── Route matching ────────────────────────────────────────────────────────
    const route = router.match(method, pathname);

    if (!route?.matched) {
      // 405 detection: only iterate other methods if route exists for any of them
      let is405 = false;
      for (let i = 0; i < ALL_METHODS.length; i++) {
        if (ALL_METHODS[i] !== method) {
          const r = router.match(ALL_METHODS[i], pathname);
          if (r?.matched) { is405 = true; break; }
        }
      }
      
      if (is405) {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!context) {
        context = new Context(
          request, 
          envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as Record<string, unknown>), 
          { params: {} }, 
          executionCtx,
          debug
        );
      }
      // 404 path: execute global middlewares
      const execute404 = async () => {
        const res = await executeHandlers(context!, middlewares);
        return res || new Response("Not Found", { status: 404 });
      };
      response = await runTracePhase(traceListeners?.handle, execute404);

      // 3. onAfterHandle for 404
      const onAfterLen = hooks.onAfterHandle.length;
      if (onAfterLen > 0 || (traceListeners && traceListeners.afterHandle.length > 0)) {
        const executeOnAfter = async () => {
          for (let i = 0; i < onAfterLen; i++) {
            const r = await hooks.onAfterHandle[i](context!, response!);
            if (r instanceof Response) response = r;
          }
        };
        await runTracePhase(traceListeners?.afterHandle, executeOnAfter);
      }
      return response!;
    }

    if (!context) {
      context = new Context(
        request, 
        envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as Record<string, unknown>), 
        { params: route.params }, 
        executionCtx,
        debug
      );
    } else {
      context.setParams(route.params);
    }

    // ── 2. onBeforeHandle ─────────────────────────────────────────────────────
    const onBeforeLen = hooks.onBeforeHandle.length;
    if (onBeforeLen > 0 || (traceListeners && traceListeners.beforeHandle.length > 0)) {
      const executeOnBefore = async () => {
        for (let i = 0; i < onBeforeLen; i++) {
          const r = await hooks.onBeforeHandle[i](context!);
          if (r instanceof Response) return r;
        }
      };
      const res = await runTracePhase(traceListeners?.beforeHandle, executeOnBefore);
      if (res instanceof Response) return res;
    }

    // ── Execute handler chain ─────────────────────────────────────────────────
    const routeMids = route.middlewares;
    const routeData = route.data

    const handlers = [...middlewares, ...routeMids, ...routeData];

    // ── 3. Execute handlers ───────────────────────────────────────────────────
    let executor: ((context: Context) => Promise<Response | undefined>) | undefined;
    if (aot) {
      executor = route.store?.executor as ((context: Context) => Promise<Response | undefined>) | undefined;
      if (!executor) {
        executor = compiledCache.get(method + route.matched_route);
        if (!executor) {
          executor = compileHandlerChain(handlers);
          if (route.store) route.store.executor = executor;
          compiledCache.set(method + route.matched_route, executor);
        }
      }
    }

    const executeHandle = async () => {
      let result: Response | undefined;
      if (aot) {
        result = await executor?.(context!);
      } else {
        result = await executeHandlers(context!, handlers);
      }
      return result || new Response("Not Found", { status: 404 });
    };
    response = await runTracePhase(traceListeners?.handle, executeHandle);

    // ── 4. onAfterHandle ──────────────────────────────────────────────────────
    const onAfterLen = hooks.onAfterHandle.length;
    if (onAfterLen > 0 || (traceListeners && traceListeners.afterHandle.length > 0)) {
      const executeOnAfter = async () => {
        for (let i = 0; i < onAfterLen; i++) {
          const r = await hooks.onAfterHandle[i](context!, response!);
          if (r instanceof Response) response = r;
        }
      };
      await runTracePhase(traceListeners?.afterHandle, executeOnAfter);
    }

  } catch (error) {
    // ── onError hooks ─────────────────────────────────────────────────────────
    const executeOnError = async () => {
      const onErrLen = hooks.onError.length;
      if (onErrLen > 0 && context) {
        for (let i = 0; i < onErrLen; i++) {
          const r = await hooks.onError[i](error as Error, context);
          if (r instanceof Response) return r;
        }
      }
    };
    
    const errRes = await runTracePhase(traceListeners?.error, executeOnError);
    if (errRes instanceof Response) {
      response = errRes;
    }
    
    if (!response) {
      if (error instanceof HttpException) {
        response = error.getResponse();
      } else {
        console.error("Unhandled error:", error);
        const payload: Record<string, unknown> = { statusCode: 500, error: "Internal Server Error", message: "An unexpected error occurred" };
        if (debug) {
            payload.message = error instanceof Error ? error.message : String(error);
            payload.stack = error instanceof Error ? error.stack : undefined;
        }
        response = new Response(
          JSON.stringify(payload),
          { status: 500, headers: { "Content-Type": "application/json; charset=UTF-8" } }
        );
      }
    }
  } finally {
    if (context && response) {
      context.finalResponse = response;
    }
    // ── Post-Response Processing ─────────────────────────────────────────────
    if (context && (hooks.onResponse.length > 0 || context.deferred || (traceListeners && traceListeners.response.length > 0))) {
      const postProcessPromise = (function(ctx, tListeners) {
        return executePostProcess(hooks, ctx, tListeners);
      })(context, traceListeners?.response);
      if (executionCtx && typeof (executionCtx as Record<string, unknown>).waitUntil === "function") {
        ((executionCtx as Record<string, unknown>).waitUntil as (p: Promise<unknown> | unknown) => void)(postProcessPromise);
      } else {
        postProcessPromise.catch(console.error);
      }
    }

    context = undefined;
    traceApi = undefined;
    traceListeners = undefined;
  }

  return response!;
}

async function executePostProcess(hooks: import("../types").Hooks, context: Context, traceListeners?: import("../types").TraceListener[]) {
  context.markFinished();
  try {
    const onResLen = hooks.onResponse.length;
    if (onResLen > 0 || (traceListeners && traceListeners.length > 0)) {
      const execOnRes = async () => {
        for (let i = 0; i < onResLen; i++) {
          await hooks.onResponse[i](context);
        }
      };
      await runTracePhase(traceListeners, execOnRes);
    }

    const deferred = context.deferred;
    if (deferred) {
      for (let i = 0; i < deferred.length; i++) {
        await deferred[i]();
      }
    }
  } catch (e) {
    console.error("ServeX background task error:", e);
  }
}
