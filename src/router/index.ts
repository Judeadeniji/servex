import type { Context } from "../context";
import type { Scope } from "../scope";
import type { Method, Handler, Route, MiddlewareHandler, Env, ServerRoute } from "../types";
import type { MergePaths } from "./types";

export type RouteOptions<P extends string, P1 extends string> = {
  middlewares: MiddlewareHandler<Context>[];
  children: Route<P, P1>[];
}; 

export function route<M extends Method, P extends string, P1 extends string>(
  path: `${M} ${P}`,
  handler: Handler<Context<Env, MergePaths<P1, P>>>,
  options?: Partial<RouteOptions<P1, P>>
)
{
  const [method, url] = path.split(" ") as [Method, P];
  return (scope: Scope<ServerRoute[], ServerRoute[]>, parent = '') => {
    // Combine handlers with middlewares if any
    const handlers = Array.isArray(options?.middlewares)
      ? [...options.middlewares, handler]
      : [handler];

    scope.route_matcher.addRoute({
      method: method.toUpperCase() as Method, // Ensure method is uppercase
      path: url,
      data: handlers,
    });

    scope.parent?.route_matcher.addSubTrie(
      parent,
      scope.route_matcher
    );

    return {
      path: url,
      method,
      handlers,
      children: options?.children
    }
  }
}
