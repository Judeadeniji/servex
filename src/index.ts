import type { Method, Route, ServerOptions, ServerRoute } from "./types";
import { Context } from "./context";
import { parseRequestBody } from "./core/request";
import { createScope, disposeScope, setScope, type Scope } from "./scope";
import { executeHandlers } from "./core/response";
import { RouterAdapter, RouterType, type RouterAdapterOptions } from "./router/adapter";
import  type { Route as RouteType } from "./router/base";

export class ServeXRequest extends Request {}

function processRoutesAndChildren(
  routes: Route<any, any>[], // I don't need type safety here
  scope: Scope<ServerRoute[], ServerRoute[]>,
  options: RouterAdapterOptions<ServerRoute[]>,
  parent = ''
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

export function createServer(options: ServerOptions<any , any>) {
  const { router = RouterType.RADIX, routes, middlewares = [] } = options;
  const thisScope = createScope(new RouterAdapter({
    type: router
   })) as Scope<ServerRoute[], ServerRoute[]>;

  processRoutesAndChildren(routes, thisScope, {
    type: router,
  });

  console.log(thisScope.route_matcher.routes.map((r) => `${r.method} ${r.path}`));
  return {
    async fetch(request: Request): Promise<Response> {
      const scope = thisScope;
      const url = new URL(request.url);
      const method = request.method.toUpperCase() as Method;
      const pathname = url.pathname;

      try {
        // Match using method and pathname separately
        const route = scope.route_matcher.match(method, pathname);
        if (!route || !route.matched) {
          // Check if the path exists with a different method for 405
          const anyMethodRoute = scope.route_matcher.match("*", pathname);
          if (anyMethodRoute && anyMethodRoute.matched) {
            return new Response("Method Not Allowed", { status: 405 });
          }
          return new Response("Not Found", { status: 404 });
        }

        const parsedBody = await parseRequestBody(request.clone());
        const context = new Context(request, process.env, {
          parsedBody,
          params: route.params,
          query: route.searchParams,
        });

        thisScope.context = context;
        setScope(thisScope)
        const response = await executeHandlers(context, [
          ...middlewares, // Add root level middlewares
          ...route.data,
        ])

        // If no handler returned a response, return 204 No Content
        return response || new Response(null, { status: 204 });
      } catch (error) {
        console.error("Error handling request:", error);
        return new Response("Internal Server Error", { status: 500 });
      } finally {
        disposeScope();
      }
    },
  };
}
