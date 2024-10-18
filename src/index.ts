import type {
  Handler,
  Method,
  MiddlewareHandler,
  Route,
  ServerOptions,
  ServerRoute,
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

function processRoutesAndChildren(
  routes: Route<any, any>[], // I don't need type safety here
  scope: Scope<ServerRoute[], ServerRoute[]>,
  options: RouterAdapterOptions<ServerRoute[]>,
  parent = ""
) {
  for (const route of routes) {
    const { children, path } = route(scope, parent);
    const childScope = createScope(new RouterAdapter<ServerRoute[]>(options));
    childScope.parent = scope;
    if (children) {
      processRoutesAndChildren(children, childScope, path);
    }
  }
}

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
    const anyMethodRoute = scope.router.match("ALL", pathname);
    if (anyMethodRoute && anyMethodRoute.matched) {
      route = anyMethodRoute;
      // return new Response("Method Not Allowed", { status: 405 });
    } else return await executeHandlers(new Context(request, process.env, {
      parsedBody: await parseRequestBody(request.clone()),
      params: {},
      query: new URLSearchParams(),
    }), middlewares);
  }

  const parsedBody = await parseRequestBody(request.clone());
  const context = new Context(request, process.env, {
    parsedBody,
    params: route.params,
    query: route.searchParams,
  });

  scope.context = context;
  setScope(scope); // Set the current scope, because the scope gets disposed after the request is handled

  const response = await executeHandlers(context, [
    ...Array.from(route.middlewares),
    ...middlewares, // Add root level middlewares
    ...route.data,
  ]);

  // If no handler returned a response, return 204 No Content
  return response || new Response(null, { status: 204 });
}

export function createServer(options: ServerOptions<any, any>) {
  const { router = RouterType.RADIX, routes, middlewares = [] } = options;
  const thisScope = createScope(
    new RouterAdapter({
      type: router,
    })
  ) as Scope<ServerRoute[], ServerRoute[]>;

  processRoutesAndChildren(routes, thisScope, {
    type: router,
  });

  console.log(thisScope.router.routes.map((r) => `${r.method} ${r.path}`));

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const method = request.method.toUpperCase() as Method;
      const pathname = url.pathname;

      try {
        return baseFetch.call(this, thisScope, request, method, pathname, middlewares);
      } catch (error) {
        console.error("Error handling request:", error);
        return new Response("Internal Server Error", { status: 500 });
      } finally {
        disposeScope();
      }
    },

    async request(input: RequestInfo, init?: RequestInit): Promise<Response> {
      return this.fetch(new ServeXRequest(input, init));
    },

    use(
      path: string | MiddlewareHandler<Context>,
      ...middlewares: MiddlewareHandler<Context>[]
    ) {
      const router = thisScope.router;
      if (typeof path === "string") {
        router.pushMiddlewares(path, middlewares);
        return this;
      }
      const handlers = [path, ...middlewares];
      // Add middleware to all routes
      router.pushMiddlewares("*", handlers);

      return this;
    },
  };
}
