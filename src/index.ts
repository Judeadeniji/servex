import type {
  Handler,
  Method,
  MiddlewareHandler,
  ServerOptions,
  ServerRoute,
  ServeXRouter,
  Env,
} from "./types";
import { Context } from "./context";
import { executeHandlers } from "./core/response";
import { HttpException } from "./http-exception";
import {
  RouterAdapter,
  RouterType,
  type RouterAdapterOptions,
} from "./router/adapter";
import { compileHandlerChain } from "./compiler";
import type { NormalisePath } from "./router/types";

// ── Trace Helper ─────────────────────────────────────────────────────────────
async function runTracePhase(
  listeners: import("./types").TraceListener[] | undefined,
  phaseExecutor: () => Promise<any> | any
): Promise<any> {
  if (!listeners || listeners.length === 0) return phaseExecutor();

  const begin = performance.now();
  const onStopCallbacks: ((info: import("./types").TraceEventInfo) => void | Promise<void>)[] = [];

  const event: import("./types").TraceEvent = {
    begin,
    onStop: (cb) => onStopCallbacks.push(cb)
  };

  for (let i = 0; i < listeners.length; i++) {
    const r = listeners[i](event);
    if (r instanceof Promise) await r;
  }

  let error: Error | null = null;
  let result: any;
  try {
    result = await phaseExecutor();
    return result;
  } catch (err: any) {
    error = err;
    throw err;
  } finally {
    const end = performance.now();
    for (let i = 0; i < onStopCallbacks.length; i++) {
      const r = onStopCallbacks[i]({ begin, end, error });
      if (r instanceof Promise) await r;
    }
  }
}

// Remove global cache

export class ServeXRequest extends Request {}


// Pre-allocated methods array for 405 detection (avoids allocation per 404)
const ALL_METHODS: Method[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

export function baseFetch(
  router: RouterAdapter<ServerRoute[]>,
  request: Request,
  method: Method,
  pathname: string,
  middlewares: Handler<Context>[],
  hooks: import("./types").Hooks,
  compiledCache: Map<string, (context: Context) => Promise<Response | undefined>>,
  envBindings?: any,
  executionCtx?: any,
  debug: boolean = false
): Response | Promise<Response> {
  // ── Fast Path (No Hooks) ───────────────────────────────────────────────────
  if (hooks.onRequest.length === 0 && hooks.onBeforeHandle.length === 0 && hooks.onAfterHandle.length === 0 && hooks.onError.length === 0 && hooks.trace.length === 0) {
    const route = router.match(method, pathname);
    if (route && route.matched) {
      let executor = route.store?.executor;
      if (!executor) {
        executor = compiledCache.get(method + route.matched_route);
        if (!executor) {
          const handlers = [...middlewares, ...route.middlewares, ...route.data];
          executor = compileHandlerChain(handlers);
          if (route.store) route.store.executor = executor;
          compiledCache.set(method + route.matched_route, executor);
        }
      }
      
      const context = new Context(
        request, 
        envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as any), 
        { params: route.params }, 
        executionCtx,
        debug
      );

      const handleValue = (r: Response | undefined) => {
        const res = r || new Response("Not Found", { status: 404 });
        context.finalResponse = res;
        if (hooks.onResponse.length > 0 || context.deferred) {
          if (executionCtx && typeof executionCtx.waitUntil === "function") {
            executionCtx.waitUntil(executePostProcess(hooks, context));
          } else {
            executePostProcess(hooks, context);
          }
        }
        return res;
      };

      const resolveError = (error: unknown): Response => {
        if (error instanceof HttpException) return error.getResponse();
        console.error("Unhandled error:", error);
        
        const payload: any = { statusCode: 500, error: "Internal Server Error", message: "An unexpected error occurred" };
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
        const res = executor(context);
        if (res instanceof Promise) {
          return res.then(handleValue).catch(error => handleValue(resolveError(error)));
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
  hooks: import("./types").Hooks,
  compiledCache: Map<string, (context: Context) => Promise<Response | undefined>>,
  envBindings?: any,
  executionCtx?: any,
  debug: boolean = false
): Promise<Response> {
  let context: Context | undefined = undefined;
  let response: Response | undefined;
  
  let traceApi: import("./types").TraceAPI<Context> | undefined;
  let traceListeners: Record<string, import("./types").TraceListener[]> | undefined;

  try {
    // ── 1. onRequest ──────────────────────────────────────────────────────────
    const onReqLen = hooks.onRequest.length;
    const hasTrace = hooks.trace.length > 0;
    
    if (onReqLen > 0 || hasTrace) {
      context = new Context(
        request, 
        envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as any), 
        { params: {} }, 
        executionCtx,
        debug
      );
      
      if (hasTrace) {
        traceListeners = { request: [], beforeHandle: [], handle: [], afterHandle: [], error: [], response: [] };
        traceApi = {
          context,
          onRequest: (cb) => traceListeners!.request.push(cb),
          onBeforeHandle: (cb) => traceListeners!.beforeHandle.push(cb),
          onHandle: (cb) => traceListeners!.handle.push(cb),
          onAfterHandle: (cb) => traceListeners!.afterHandle.push(cb),
          onError: (cb) => traceListeners!.error.push(cb),
          onResponse: (cb) => traceListeners!.response.push(cb),
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

    if (!route || !route.matched) {
      // 405 detection: only iterate other methods if route exists for any of them
      let is405 = false;
      for (let i = 0; i < ALL_METHODS.length; i++) {
        if (ALL_METHODS[i] !== method) {
          const r = router.match(ALL_METHODS[i], pathname);
          if (r && r.matched) { is405 = true; break; }
        }
      }
      
      if (is405) {
        return new Response("Method Not Allowed", { status: 405 });
      }

      if (!context) {
        context = new Context(
          request, 
          envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as any), 
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
        envBindings ?? ((typeof process !== "undefined" ? process.env : {}) as any), 
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

    let result: Response | undefined = undefined;

    // ── 3. Execute handlers ───────────────────────────────────────────────────
    let executor = route.store?.executor;
    if (!executor) {
      executor = compiledCache.get(method + route.matched_route);
      if (!executor) {
        const handlers = [...middlewares, ...routeMids, ...routeData];
        executor = compileHandlerChain(handlers);
        if (route.store) route.store.executor = executor;
        compiledCache.set(method + route.matched_route, executor);
      }
    }

    const executeHandle = async () => {
      let result = await executor!(context!);
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
        const payload: any = { statusCode: 500, error: "Internal Server Error", message: "An unexpected error occurred" };
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
      const execResponse = () => executePostProcess(hooks, context!, traceListeners?.response);
      if (executionCtx && typeof executionCtx.waitUntil === "function") {
        executionCtx.waitUntil(execResponse());
      } else {
        // Run in background without awaiting
        execResponse();
      }
    }
  }

  return response!;
}

async function executePostProcess(hooks: import("./types").Hooks, context: Context, traceListeners?: import("./types").TraceListener[]) {
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

export class ServeXRouterImpl<E extends Env = Env, S = {}, B extends string = "/"> implements ServeXRouter<E, S, B> {
    constructor(protected routerAdapter: RouterAdapter<ServerRoute[]>) {}

    onResponse(handler: import("./types").HookHandler<Context<E>>): this {
        throw new Error("onResponse hook can only be registered on the main ServeXApp instance, not a sub-router.");
    }

    trace(handler: (api: import("./types").TraceAPI<Context<E>>) => void | Promise<void>): this {
        throw new Error("trace hook can only be registered on the main ServeXApp instance, not a sub-router.");
    }

    use(path: string | MiddlewareHandler<Context>, ...middlewares: MiddlewareHandler<Context>[]) {
        if (typeof path === "string") {
            this.routerAdapter.pushMiddlewares(path, middlewares);
            return this;
        }
        this.routerAdapter.pushMiddlewares("*", [path, ...middlewares]);
        return this;
    }

    private add(method: Method, path: string, handlers: Handler<Context>[]) {
        this.routerAdapter.addRoute({
            method,
            path,
            data: handlers
        });
        return this;
    }

    get(path: string, ...handlers: any[]) { return this.add("GET", path, handlers); }
    post(path: string, ...handlers: any[]) { return this.add("POST", path, handlers); }
    put(path: string, ...handlers: any[]) { return this.add("PUT", path, handlers); }
    delete(path: string, ...handlers: any[]) { return this.add("DELETE", path, handlers); }
    patch(path: string, ...handlers: any[]) { return this.add("PATCH", path, handlers); }
    options(path: string, ...handlers: any[]) { return this.add("OPTIONS", path, handlers); }
    head(path: string, ...handlers: any[]) { return this.add("HEAD", path, handlers); }
    all(path: string, ...handlers: any[]) {
        ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"].forEach(m => this.add(m as Method, path, handlers));
        return this;
    }

    route(path: string, fnOrApp: any) {
        if (fnOrApp instanceof ServeXRouterImpl) {
            this.routerAdapter.addSubTrie(path, fnOrApp.routerAdapter);
            return this as any;
        }

        const childRouter = new RouterAdapter<ServerRoute[]>({ type: this.routerAdapter.type });
        const childServeXRouter = new ServeXRouterImpl(childRouter);
        fnOrApp(childServeXRouter);
        this.routerAdapter.addSubTrie(path, childRouter);
        return this as any;
    }

    mount(path: string, fetchFn: (request: Request, env?: any, ctx?: any) => Response | Promise<Response>) {
        // Strip trailing slash if present to ensure the wildcard matches correctly
        const normalizedPath = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
        
        const handler = (c: import("./context").Context) => {
            const req = c.req;
            const url = new URL(req.url);
            
            // Strip the mount path from the URL
            let newPathname = url.pathname.slice(normalizedPath.length);
            if (!newPathname.startsWith("/")) {
                newPathname = "/" + newPathname;
            }
            url.pathname = newPathname;
            
            // Create a new request with the stripped URL
            const newReq = new Request(url.toString(), req);
            return fetchFn(newReq, c.env, c.executionCtx);
        };

        // Mount a catch-all route at the specified path
        this.all(`${normalizedPath}/*`, handler);
        
        // Also map the exact path without trailing slash
        this.all(normalizedPath, handler);

        return this as any;
    }

    /**
     * Handle an incoming `Request`.
     * Note: This method is only fully implemented on the main application instance
     * returned by `createServer()`.
     */
    fetch = (_request: Request, _env?: any, _executionCtx?: any): Response | Promise<Response> => {
        throw new Error(
            "Cannot call fetch() on a sub-router. Please ensure you are calling fetch() on the main application instance created by createServer()."
        );
    };

    /** @see fetch */
    request = (_input: RequestInfo, _init?: RequestInit): Response | Promise<Response> => {
        throw new Error(
            "Cannot call request() on a sub-router. Please ensure you are calling request() on the main application instance created by createServer()."
        );
    };
}

export class ServeXApp<E extends Env = Env, S = {}, B extends string = "/"> extends ServeXRouterImpl<E, S, B> {
    public hooks: import("./types").Hooks = {
        onRequest: [],
        onBeforeHandle: [],
        onAfterHandle: [],
        onError: [],
        onResponse: [],
        trace: []
    };
    public compiledCache = new Map<string, (context: Context) => Promise<Response | undefined>>();

    /**
     * The literal base path this app is scoped to.
     * Always starts with `/`, never ends with `/` (except for the root `"/"`).
     * Typed as the literal `B` so RPC clients can read it from `typeof app`.
     */
    public readonly basePath: B;

    constructor(
        router: RouterAdapter<ServerRoute[]>,
        private middlewares: Handler<Context>[],
        basePath: B = "/" as B,
        public debug: boolean = false
    ) {
        super(router);
        // normalisePath at runtime; cast to B since the normalised form is the
        // contract the user agreed to when writing the literal.
        this.basePath = normalisePath(basePath) as B;
    }

    onRequest(handler: import("./types").HookHandler<Context>) { this.hooks.onRequest.push(handler); return this; }
    onBeforeHandle(handler: import("./types").HookHandler<Context>) { this.hooks.onBeforeHandle.push(handler); return this; }
    onAfterHandle(handler: import("./types").AfterHandleHook<Context>) { this.hooks.onAfterHandle.push(handler); return this; }
    onError(handler: import("./types").ErrorHook<Context>) { this.hooks.onError.push(handler); return this; }
    onResponse(handler: import("./types").HookHandler<Context<E>>) { this.hooks.onResponse.push(handler as any); return this; }
    trace(handler: (api: import("./types").TraceAPI<Context<E>>) => void | Promise<void>) { this.hooks.trace.push(handler as any); return this; }

    use(path: string | import("./types").MiddlewareHandler<Context>, ...middlewares: import("./types").MiddlewareHandler<Context>[]) {
        if (typeof path === "string") {
            if (path === "*" || path === "/*") {
                this.middlewares.push(...middlewares);
            } else {
                this.routerAdapter.pushMiddlewares(path, middlewares);
            }
            return this;
        }
        this.middlewares.push(path, ...middlewares);
        return this;
    }

    fetch = (request: Request, env?: any, executionCtx?: any): Promise<Response> | Response => {
        const url = request.url;
        const queryIndex = url.indexOf("?", 8);
        let pathIdx = url.indexOf("/", 8);

        let pathname: string;
        if (pathIdx === -1) {
            pathname = "/";
        } else {
            pathname = url.substring(pathIdx, queryIndex === -1 ? url.length : queryIndex);
        }

        // ── Base path stripping ───────────────────────────────────────────────
        if (this.basePath !== "/") {
            if (!pathname.startsWith(this.basePath)) {
                // Request is outside this app's base path — return 404 immediately.
                return new Response(
                    JSON.stringify({ statusCode: 404, error: "Not Found", message: "Not Found" }),
                    { status: 404, headers: { "Content-Type": "application/json; charset=UTF-8" } }
                );
            }
            // Strip the prefix; ensure the remaining path starts with "/".
            pathname = pathname.slice(this.basePath.length) || "/";
        }

        const method = request.method as Method;

        return baseFetch(this.routerAdapter, request, method, pathname, this.middlewares, this.hooks, this.compiledCache, env, executionCtx, this.debug);
    };

    request = (input: RequestInfo, init?: RequestInit): Promise<Response> | Response => {
        return this.fetch(new ServeXRequest(input, init));
    };
}

export function createServer<E extends Env = Env, B extends string = "/">(
  options: ServerOptions<B> = {} as ServerOptions<B>
): ServeXRouter<E, {}, NormalisePath<B>> & ServeXApp<E, {}, NormalisePath<B>> {
  const { router = RouterType.SONIC, middlewares = [], basePath, debug = false } = options;
  const routerAdapter = new RouterAdapter<ServerRoute[]>({
    type: router,
  });

  return new ServeXApp<E, {}, NormalisePath<B>>(
    routerAdapter,
    middlewares,
    basePath as NormalisePath<B>,
    debug
  ) as ServeXRouter<E, {}, NormalisePath<B>> & ServeXApp<E, {}, NormalisePath<B>>;
}

/**
 * Normalises a base path:
 *  - Ensures it starts with "/".
 *  - Strips any trailing slash (except for root "/").
 * @internal
 */
export function normalisePath(path: string): string {
  if (!path || path === "/") return "/";
  const withLeading = path.startsWith("/") ? path : `/${path}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

export * from "./storage";
