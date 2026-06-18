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
import { createScope, disposeScope, setScope, type Scope } from "./scope";
import { executeHandlers } from "./core/response";
import {
  RouterAdapter,
  RouterType,
  type RouterAdapterOptions,
} from "./router/adapter";

export class ServeXRequest extends Request {}


// Pre-allocated methods array for 405 detection (avoids allocation per 404)
const ALL_METHODS: Method[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

async function baseFetch(
  scope: Scope<any[], ServerRoute[]>,
  request: Request,
  method: Method,
  pathname: string,
  middlewares: Handler<Context>[],
  hooks: import("./types").Hooks
): Promise<Response> {
  const context = new Context(request, Bun.env as Record<string, string | undefined>, { params: {} });
  scope.context = context;
  setScope(scope);

  let response: Response | undefined;

  try {
    // ── 1. onRequest ──────────────────────────────────────────────────────────
    const onReqLen = hooks.onRequest.length;
    if (onReqLen > 0) {
      for (let i = 0; i < onReqLen; i++) {
        const r = await hooks.onRequest[i](context);
        if (r instanceof Response) return r; // short-circuit before routing
      }
    }

    // ── Route matching ────────────────────────────────────────────────────────
    const route = scope.router.match(method, pathname);

    if (!route || !route.matched) {
      // 405 detection: only iterate other methods if route exists for any of them
      let is405 = false;
      for (let i = 0; i < ALL_METHODS.length; i++) {
        if (ALL_METHODS[i] !== method) {
          const r = scope.router.match(ALL_METHODS[i], pathname);
          if (r && r.matched) { is405 = true; break; }
        }
      }
      
      if (is405) {
        return new Response("Method Not Allowed", { status: 405 });
      }

      // 404 path: execute global middlewares
      response = await executeHandlers(context, middlewares);
      if (!response) response = new Response("Not Found", { status: 404 });

      // 3. onAfterHandle for 404
      const onAfterLen = hooks.onAfterHandle.length;
      if (onAfterLen > 0) {
        for (let i = 0; i < onAfterLen; i++) {
          const r = await hooks.onAfterHandle[i](context, response);
          if (r instanceof Response) response = r;
        }
      }
      return response;
    }

    context.setParams(route.params);

    // ── 2. onBeforeHandle ─────────────────────────────────────────────────────
    const onBeforeLen = hooks.onBeforeHandle.length;
    if (onBeforeLen > 0) {
      for (let i = 0; i < onBeforeLen; i++) {
        const r = await hooks.onBeforeHandle[i](context);
        if (r instanceof Response) return r;
      }
    }

    // ── Execute handler chain ─────────────────────────────────────────────────
    // Build a flat combined array only once; avoid concat() allocation by
    // pre-calculating the total length and filling manually.
    const routeMids = route.middlewares;
    const routeData = route.data;
    const rmLen = routeMids.length;
    const mwLen = middlewares.length;
    const rdLen = routeData.length;
    const total = rmLen + mwLen + rdLen;

    let handlers: Handler<Context>[];
    if (total === rdLen) {
      // Fast path: no route-level middlewares and no global middlewares
      handlers = routeData;
    } else {
      handlers = new Array(total);
      let h = 0;
      for (let i = 0; i < rmLen; i++) handlers[h++] = routeMids[i];
      for (let i = 0; i < mwLen; i++) handlers[h++] = middlewares[i];
      for (let i = 0; i < rdLen; i++) handlers[h++] = routeData[i];
    }

    response = await executeHandlers(context, handlers);
    if (!response) response = new Response("Not Found", { status: 404 });

    // ── 3. onAfterHandle ──────────────────────────────────────────────────────
    const onAfterLen = hooks.onAfterHandle.length;
    if (onAfterLen > 0) {
      for (let i = 0; i < onAfterLen; i++) {
        const r = await hooks.onAfterHandle[i](context, response);
        if (r instanceof Response) response = r;
      }
    }

  } catch (error) {
    // ── onError hooks ─────────────────────────────────────────────────────────
    const onErrLen = hooks.onError.length;
    if (onErrLen > 0) {
      for (let i = 0; i < onErrLen; i++) {
        const r = await hooks.onError[i](error as Error, context);
        if (r instanceof Response) { response = r; break; }
      }
    }
    if (!response) {
      console.error("Unhandled error:", error);
      response = new Response("Internal Server Error", { status: 500 });
    }
  } finally {
    // ── onResponse hooks ─────────────────────────────────────────────────────
    const onResLen = hooks.onResponse.length;
    if (onResLen > 0) {
      for (let i = 0; i < onResLen; i++) {
        await hooks.onResponse[i](context);
      }
    }
    disposeScope();
  }

  return response!;
}

export class ServeXRouterImpl<S = {}> implements ServeXRouter<S> {
    constructor(protected routerAdapter: RouterAdapter<ServerRoute[]>) {}

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
    all(path: string, ...handlers: any[]) { return this.add("ALL", path, handlers); }

    route(path: string, fn: any) {
        const childRouter = new RouterAdapter<ServerRoute[]>({ type: RouterType.RADIX });
        const childServeXRouter = new ServeXRouterImpl(childRouter);
        fn(childServeXRouter);
        this.routerAdapter.addSubTrie(path, childRouter);
        return this as any;
    }
}

export class ServeXApp<S = {}> extends ServeXRouterImpl<S> {
    public hooks: import("./types").Hooks = {
        onRequest: [],
        onBeforeHandle: [],
        onAfterHandle: [],
        onError: [],
        onResponse: []
    };

    constructor(private scope: Scope<ServerRoute[], ServerRoute[]>, private middlewares: Handler<Context>[]) {
        super(scope.router as RouterAdapter<ServerRoute[]>);
    }

    onRequest(handler: import("./types").HookHandler<Context>) { this.hooks.onRequest.push(handler); return this; }
    onBeforeHandle(handler: import("./types").HookHandler<Context>) { this.hooks.onBeforeHandle.push(handler); return this; }
    onAfterHandle(handler: import("./types").AfterHandleHook<Context>) { this.hooks.onAfterHandle.push(handler); return this; }
    onError(handler: import("./types").ErrorHook<Context>) { this.hooks.onError.push(handler); return this; }
    onResponse(handler: import("./types").HookHandler<Context>) { this.hooks.onResponse.push(handler); return this; }

    async fetch(request: Request): Promise<Response> {
        const url = request.url;
        let pathname = url;
        const schemeIdx = url.indexOf("://");
        if (schemeIdx !== -1) {
            const pathIdx = url.indexOf("/", schemeIdx + 3);
            if (pathIdx !== -1) {
                const searchIdx = url.indexOf("?", pathIdx);
                pathname = searchIdx !== -1 ? url.substring(pathIdx, searchIdx) : url.substring(pathIdx);
            } else {
                pathname = "/";
            }
        } else {
            const searchIdx = url.indexOf("?");
            if (searchIdx !== -1) {
                pathname = url.substring(0, searchIdx);
            }
        }
        const method = request.method as Method;

        return baseFetch(this.scope, request, method, pathname, this.middlewares, this.hooks);
    }

    async request(input: RequestInfo, init?: RequestInit): Promise<Response> {
        return this.fetch(new ServeXRequest(input, init));
    }
}

export function createServer(options: ServerOptions<string, string> = {}) {
  const { router = RouterType.RADIX, middlewares = [] } = options;
  const thisScope = createScope(
    new RouterAdapter({
      type: router,
    })
  ) as Scope<ServerRoute[], ServerRoute[]>;

  return new ServeXApp<{}>(thisScope, middlewares) as ServeXRouter<{}> & ServeXApp<{}>;
}
