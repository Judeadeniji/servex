import type {
  Env,
  Handler,
  HTTPMethod,
  Plugin,
  RequestContext,
  ServerOptions,
  ServeXInterface,
} from "./types";
import { Context } from "./context";
import { parseRequestBody } from "./core/request";
import { createScope, disposeScope, type Scope } from "./scope";
import { executeHandlers } from "./core/response";
import { RegExpRouter } from "./router/reg-exp-router/router";
import {
  METHOD_NAME_ALL_LOWERCASE,
  METHODS,
  type Params,
  type RouterRoute,
} from "./router/types";
import { route } from "../dist";
import { mergePath } from "./router/utils";

export class ServeXRequest extends Request {}

class ServeXPluginManager<E extends Env> {
  #plugins: Plugin<E>[];
  #server: ServeX<E>;
  #disposers: (() => void)[] = [];
  constructor(server: ServeX<E>, plugins: Plugin<E>[]) {
    this.#plugins = plugins;
    this.#server = server;
  }

  invokePlugins = (scope: Scope<E, any>) => {
    const disposers: (() => void)[] = [];
    for (const plugin of this.#plugins) {
      const { name } = plugin;
      try {
        const ret = plugin.onInit({
          scope,
          server: this.#server,
          events$: {
            onRequest: (cb) => {
              this.#server.on(
                "server:request",
                (rc: RequestContext<E>, req: Request) => {
                  cb!(rc, req);
                }
              );
            },
            onResponse: (cb) =>
              this.#server.on(
                "server:response",
                (rc: RequestContext<E>, response: Response) => {
                  cb!(rc, response);
                }
              ),
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

type RouteHandlerPair<E extends Env> = [Handler<E>, RouterRoute<E>];
class ServeX<E extends Env = Env, P extends string = "/"> {
  private scope: Scope<E, RouteHandlerPair<E>>;
  #pluginManager: ServeXPluginManager<E>;
  #globals = new Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>();
  #__env__: () => E["Variables"] = () => process.env;
  #events = new EventManager();
  routes: RouterRoute<E>[] = [];
  #router = new RegExpRouter<RouteHandlerPair<E>>();
  #path: string = "";
  get!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  post!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  put!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  patch!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  delete!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  trace!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  connect!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  options!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  head!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  all!: <P extends string>(path: P, ...handlers: Handler<E, P>[]) => this;
  private _basePath: string;

  constructor(options?: ServerOptions<E>) {
    const { plugins = [], basePath = "/" } = options || {};
    this._basePath = basePath;
    this.#pluginManager = new ServeXPluginManager(this, plugins);
    this.scope = createScope(this.#router);
    this.#pluginManager.invokePlugins(this.scope);

    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1: string | Handler<E>, ...args: Handler<E>[]) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          if (typeof handler !== "string") {
            this.addRoute(method, this.#path, handler);
          }
        });
        return this as any;
      };
    });
  }

  private errorCallback = (e?: any) => {
    console.log(e);
  };

  private dispatch = async (
    scope: Scope<E, RouteHandlerPair<E>>,
    request: Request,
    globals: Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>
  ) => {
    const { method, url } = request;
    const { pathname, searchParams } = new URL(url);
    // Match using method and pathname separately
    const [handlers, paramsStash] = scope.router.match(method, pathname);

    function exec(c: Context<E>) {
      return executeHandlers<E>(c, handlers);
    }

    const requestContext: RequestContext<E> = {
      parsedBody: await parseRequestBody(request.clone()),
      params: {},
      query: searchParams,
      globals,
      path: pathname,
    };

    // Emit a server:request event
    await this.#events.emit("server:request", requestContext, request);
    const ctx = new Context<E>(request, this.#__env__(), requestContext);
    const response = await exec(ctx);
    // Emit a server:response event
    await this.#events.emit("server:response", requestContext, response);
    return response;
  };

  fetch = async (request: Request) => {
    try {
      return await this.dispatch(this.scope, request, this.#globals);
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

  // Helper method to add routes
  private addRoute = (method: string, path: string, handler: Handler<E, P>) => {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r: RouterRoute<E> = { path: path, method: method, handler: handler };
    this.#router.add(method, path, [handler, r]);
    this.routes.push(r);
  };

  on = (...args: Parameters<EventManager["on"]>) => this.#events.on(...args);
}

export function createServer<E extends Env = Env>(options?: ServerOptions<E>) {
  return new ServeX<E>(options);
}

export type { ServeXInterface, ServeX };
