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
import { parseRequestBody } from "./core/request";
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
  middlewares: Handler<Context>[]
) {
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
      const response = await executeHandlers(new Context(request, process.env, {
        parsedBody: await parseRequestBody(request.clone()),
        params: {},
        query: new URL(request.url).searchParams,
      }), middlewares);
      return response || new Response("Not Found", { status: 404 });
    }
  }

  const parsedBody = await parseRequestBody(request.clone());
  const context = new Context(request, process.env, {
    parsedBody,
    params: route.params,
    query: new URL(request.url).searchParams,
  });

  scope.context = context;
  setScope(scope); // Set the current scope, because the scope gets disposed after the request is handled

  const response = await executeHandlers(context, [
    ...Array.from(route.middlewares),
    ...middlewares, // Add root level middlewares
    ...route.data,
  ]);

  // If no handler returned a response, return 404 Not Found
  return response || new Response("Not Found", { status: 404 });
}

export class ServeXRouterImpl implements ServeXRouter {
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

    get<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("GET", path, handlers as any); }
    post<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("POST", path, handlers as any); }
    put<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("PUT", path, handlers as any); }
    delete<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("DELETE", path, handlers as any); }
    patch<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("PATCH", path, handlers as any); }
    options<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("OPTIONS", path, handlers as any); }
    head<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("HEAD", path, handlers as any); }
    all<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]) { return this.add("ALL", path, handlers as any); }

    route(path: string, fn: (r: ServeXRouter) => void) {
        const childRouter = new RouterAdapter<ServerRoute[]>({ type: RouterType.RADIX });
        const childServeXRouter = new ServeXRouterImpl(childRouter);
        fn(childServeXRouter);
        this.routerAdapter.addSubTrie(path, childRouter as any);
        return this;
    }
}

export class ServeXApp extends ServeXRouterImpl {
    constructor(private scope: Scope<ServerRoute[], ServerRoute[]>, private middlewares: Handler<Context>[]) {
        super(scope.router as RouterAdapter<ServerRoute[]>);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const method = request.method.toUpperCase() as Method;
        const pathname = url.pathname;

        try {
            return await baseFetch(this.scope, request, method, pathname, this.middlewares);
        } catch (error) {
            console.error("Error handling request:", error);
            return new Response("Internal Server Error", { status: 500 });
        } finally {
            disposeScope();
        }
    }

    async request(input: RequestInfo, init?: RequestInit): Promise<Response> {
        return this.fetch(new ServeXRequest(input, init));
    }
}

export function createServer(options: ServerOptions<any, any> = {}) {
  const { router = RouterType.RADIX, middlewares = [] } = options;
  const thisScope = createScope(
    new RouterAdapter({
      type: router,
    })
  ) as Scope<ServerRoute[], ServerRoute[]>;

  return new ServeXApp(thisScope, middlewares);
}
