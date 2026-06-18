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



async function baseFetch(
  scope: Scope<any[], ServerRoute[]>,
  request: Request,
  method: Method,
  pathname: string,
  middlewares: Handler<Context>[],
  hooks: import("./types").Hooks
) {
  const context = new Context(request, Bun.env as Record<string, string | undefined>, { params: {} });
  scope.context = context;
  setScope(scope);

    // 1. onRequest Hook
    for (let i = 0; i < hooks.onRequest.length; i++) {
      const res = await hooks.onRequest[i](context);
      if (res instanceof Response) return res;
    }

    // Match using method and pathname separately
    let route = scope.router.match(method, pathname);
  if (!route || !route.matched) {
    // Check if the path exists with a different method for 405
    const methods: Method[] = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];
    let is405 = false;
    for (const m of methods) {
      if (m !== method) {
        const anyMethodRoute = scope.router.match(m, pathname);
        if (anyMethodRoute && anyMethodRoute.matched) {
            is405 = true;
            break;
        }
      }
    }
    if (is405) {
      return new Response("Method Not Allowed", { status: 405 });
    } else {
      let response = await executeHandlers(context, middlewares);
      if (!response) response = new Response("Not Found", { status: 404 });
      
      // onAfterHandle for 404/405
      for (let i = 0; i < hooks.onAfterHandle.length; i++) {
        const afterRes = await hooks.onAfterHandle[i](context, response);
        if (afterRes instanceof Response) response = afterRes;
      }
      return response;
    }
  }

  context.setParams(route.params); // Update params for matched route

  // 2. onBeforeHandle Hook
  for (let i = 0; i < hooks.onBeforeHandle.length; i++) {
    const res = await hooks.onBeforeHandle[i](context);
    if (res instanceof Response) return res;
  }

  const routeMids = route.middlewares;
  const routeData = route.data;
  const totalHandlers = routeMids.length + middlewares.length + routeData.length;
  const handlers = new Array(totalHandlers);
  
  let hIdx = 0;
  for (let i = 0; i < routeMids.length; i++) handlers[hIdx++] = routeMids[i];
  for (let i = 0; i < middlewares.length; i++) handlers[hIdx++] = middlewares[i];
  for (let i = 0; i < routeData.length; i++) handlers[hIdx++] = routeData[i];

  let response = await executeHandlers(context, handlers);
  if (!response) response = new Response("Not Found", { status: 404 });

  // 3. onAfterHandle Hook
  for (let i = 0; i < hooks.onAfterHandle.length; i++) {
    const afterRes = await hooks.onAfterHandle[i](context, response);
    if (afterRes instanceof Response) response = afterRes;
  }

  return response;
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

        let response: Response;
        try {
            response = await baseFetch(this.scope, request, method, pathname, this.middlewares, this.hooks);
        } catch (error) {
            let handled = false;
            if (this.scope.context) {
              for (let i = 0; i < this.hooks.onError.length; i++) {
                  const errRes = await this.hooks.onError[i](error as Error, this.scope.context);
                  if (errRes instanceof Response) {
                      response = errRes;
                      handled = true;
                      break;
                  }
              }
            }
            if (!handled) {
                console.error("Error handling request:", error);
                response = new Response("Internal Server Error", { status: 500 });
            }
        } finally {
            if (this.scope.context && response!) {
              for (let i = 0; i < this.hooks.onResponse.length; i++) {
                // Ignore return values on onResponse
                await this.hooks.onResponse[i](this.scope.context);
              }
            }
            disposeScope();
        }
        return response!;
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
