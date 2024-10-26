import type { Context } from "../context";
import type { Scope } from "../scope";
import type { Method, Handler, Route, MiddlewareHandler, Env, ServerRoute } from "../types";
import type { MergePaths } from "./types";

export type RouteOptions<
E extends Env,
P extends string, P1 extends string> = {
  middlewares: MiddlewareHandler<E>[];
  children: Route<E, P, P1>[];
}; 

export function route<
E extends Env,
M extends Method, P extends string, P1 extends string>(
  path: `${M} ${P}`,
  handler: Handler<E>,
  options?: Partial<RouteOptions<E, P1, P>>
)
{
  const [method, url] = path.split(" ") as [Method, P];
  return (scope: Scope<E, ServerRoute[]>, parent = ''): ReturnType<Route<E, P, P1>> => {
    // Combine handlers with middlewares if any
    const handlers = Array.isArray(options?.middlewares)
      ? [...options.middlewares, handler]
      : [handler];

    scope.router.addRoute({
      method: method.toUpperCase() as Method, // Ensure method is uppercase
      path: url,
      data: handlers,
    });

    scope.parent?.router.addSubTrie(
      parent,
      scope.router
    );

    return {
      path: url,
      method,
      handlers,
      children: options?.children as Route<E, string, string>[] | [],
    }
  }
}
