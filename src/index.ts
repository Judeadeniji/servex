import type {
  Env,
  Handler,
  Method,
  MiddlewareHandler,
  Plugin,
  RequestContext,
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

class ServeXPluginManager<E extends Env> {
  #plugins: Plugin<E>[];
  #server: ServeX<E>;
  #disposers: (() => void)[] = [];
  constructor(server: ServeX<E>, plugins: Plugin<E>[]) {
    this.#plugins = plugins;
    this.#server = server;
  }

  invokePlugins = (scope: Scope<E, ServerRoute[]>) => {
    const disposers: (() => void)[] = [];
    for (const plugin of this.#plugins) {
      const { name } = plugin;
      try {
        const ret = plugin.onInit({
          scope,
          server: this.#server,
          events$: {
            onRequest: (cb) => {
              this.#server.on("server:request", (rc: RequestContext<E>, req: Request) => {
                cb!(rc, req);
              });
            },
            onResponse: (cb) =>
              this.#server.on("server:response", (rc: RequestContext<E>, response: Response) => {
                cb!(rc, response);
              }),
          },
        });
        if (ret) {
          disposers.push(ret.dispose);
        }
      } catch (error) {
        console.error(`[ServeX: ${name}]`, error);
      }
    }

    this.#disposers = disposers;
  };

  dispose = () => {
    for (const disposer of this.#disposers) {
      disposer();
    }
  };
}

class EventManager {
  #events = new Map<string, Function[]>();

  on(event: string, handler: Function) {
    const handlers = this.#events.get(event);
    if (handlers) {
      handlers.push(handler);
    } else {
      this.#events.set(event, [handler]);
    }
  }

  off(event: string, handler: Function) {
    const handlers = this.#events.get(event);
    if (!handlers) {
      return;
    }

    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  async emit(event: string, ...data: any[]) {
    const handlers = this.#events.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      await handler(...data);
    }
  }
}

class ServeX<E extends Env = Env> extends EventManager {
  private scope: Scope<E, ServerRoute[]>;
  private middlewares: MiddlewareHandler<E>[];
  #pluginManager: ServeXPluginManager<E>;
  #globals = new Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>();
  #__env__: () => E["Variables"] = () => process.env;

  constructor(options: ServerOptions<E>) {
    super();
    const {
      router = RouterType.RADIX,
      middlewares = [],
      plugins = [],
    } = options;
    this.#pluginManager = new ServeXPluginManager(this, plugins);
    this.middlewares = middlewares;
    this.scope = createScope(
      new RouterAdapter({
        type: router,
      })
    ) as Scope<E, ServerRoute[]>;


    this.#pluginManager.invokePlugins(this.scope);
  }

  private dispatch = async (
    scope: Scope<E, ServerRoute[]>,
    request: Request,
    method: Method,
    pathname: string,
    middlewares: Handler<E>[],
    globals: Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>
  ) => {
    // Match using method and pathname separately
    let route = scope.router.match(method, pathname);
    if (!route || !route.matched) {
      // Check if the path exists with a different method for 405
      const anyMethodRoute = scope.router.match("ALL", pathname);
      if (anyMethodRoute && anyMethodRoute.matched) {
        route = anyMethodRoute;
        // return new Response("Method Not Allowed", { status: 405 });
      } else {
        const requestContext: RequestContext<E> = {
          parsedBody: await parseRequestBody(request.clone()),
          params: route?.params || {},
          query: new URLSearchParams(),
          globals,
          path: request.url
        };

        // Emit a server:request event
        await this.emit("server:request", requestContext, request);

        const ctx = new Context<E>(request, this.#__env__(), requestContext);
        const response = await executeHandlers(ctx, middlewares);

        // Emit a server:response event
        await this.emit("server:response", requestContext, response);
        return response;
      }
    }

    const parsedBody = await parseRequestBody(request.clone());
    const requestContext: RequestContext<E> = {
      parsedBody,
      params: route.params,
      query: route.searchParams,
      globals,
      path: request.url
    };
    const context = new Context<E>(request, this.#__env__(), requestContext);

    scope.context = context;
    setScope(scope); // Set the current scope, because the scope gets disposed after the request is handled

    await this.emit("server:request", requestContext, request);
    const response = await executeHandlers(context, [
      ...Array.from(route.middlewares),
      ...middlewares, // Add root level middlewares
      ...(route.data as Handler<E>[]),
    ]);

    await this.emit("server:response", requestContext, response);

    // If no handler returned a response, return 204 No Content
    return response || new Response(null, { status: 204 });
  };

  fetch = async (request: Request) => {
    const url = new URL(request.url);
    const method = request.method.toUpperCase() as Method;
    const pathname = url.pathname;

    try {
      return await this.dispatch(
        this.scope,
        request,
        method,
        pathname,
        this.middlewares,
        this.#globals
      );
    } catch (error) {
      console.error("Error handling request:", error);
      return new Response("Internal Server Error", { status: 500 });
    } finally {
      disposeScope();
    }
  };

  async request(input: RequestInfo, init?: RequestInit): Promise<Response> {
    return this.fetch(new ServeXRequest(input, init));
  }

  use(
    path: string | MiddlewareHandler<E>,
    ...middlewares: MiddlewareHandler<E>[]
  ) {
    const router = this.scope.router;
    if (typeof path === "string") {
      router.pushMiddlewares(path, middlewares);
      return this;
    }
    const handlers = [path, ...middlewares];
    // Add middleware to all routes
    router.pushMiddlewares("*", handlers);

    return this;
  }

  get = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "GET",
      path: route,
    });
    return this;
  };

  post = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "POST",
      path: route,
    });
    return this;
  };

  put = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "PUT",
      path: route,
    });
    return this;
  };

  patch = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "PATCH",
      path: route,
    });
    return this;
  };

  all = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "ALL",
      path: route,
    });
    return this;
  };

  head = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "HEAD",
      path: route,
    });
    return this;
  };

  delete = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "DELETE",
      path: route,
    });
    return this;
  };

  options = (route: string, ...handlers: Handler<E>[]) => {
    this.scope.router.addRoute({
      data: handlers,
      method: "OPTIONS",
      path: route,
    });
    return this;
  };
}

export function createServer<E extends Env = Env>(
  options: ServerOptions<E>
) {
  return new ServeX<E>(options);
}

export type { ServeX };
