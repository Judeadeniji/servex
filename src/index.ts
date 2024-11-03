import process from "node:process";

import type {
  Env,
  Handler,
  Plugin,
  RequestContext,
  ServerOptions,
  ServeXInterface,
} from "./types";
import { Context } from "./context";
import { createScope, disposeScope, type Scope } from "./scope";
import { executeHandlers } from "./core/response";
import { RegExpRouter } from "./router/reg-exp-router/router";
import {
  METHOD_NAME_ALL_LOWERCASE,
  METHODS,
  type RouteHandlerPair,
  type RouterRoute,
} from "./router/types";
import { mergePath } from "./router/utils";

// Pre-compute method array for faster lookups
const ALL_METHODS = [...METHODS, METHOD_NAME_ALL_LOWERCASE];

export class ServeXRequest extends Request {
  #cacheKey: string | null = null;
  #parsedUrl: URL | null = null;

  get _url() {
    if (!this.#parsedUrl) {
      this.#parsedUrl = new URL(super.url);
    }
    return this.#parsedUrl;
  }

  // Helper to get cache key
  getCacheKey(): string {
    if (!this.#cacheKey) {
      this.#cacheKey = `${this.method}:${this._url.pathname}`;
    }
    return this.#cacheKey;
  }
}

class ServeXPluginManager<E extends Env> {
  #plugins: Plugin<E>[];
  #server: ServeX<E>;
  #disposers: (() => void)[] = [];
  constructor(server: ServeX<E>, plugins: Plugin<E>[]) {
    this.#plugins = plugins;
    this.#server = server;
  }

  invokePlugins = async (scope: Scope<E, any>) => {
    const disposers: (() => void)[] = [];
    for (const plugin of this.#plugins) {
      const { name } = plugin;
      try {
        const ret = await plugin.onInit({
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
  #events = new Map<string, Set<Function>>();

  on(event: string, handler: Function): void {
    let handlers = this.#events.get(event);
    if (!handlers) {
      handlers = new Set();
      this.#events.set(event, handlers);
    }
    handlers.add(handler);
  }

  off(event: string, handler: Function): void {
    const handlers = this.#events.get(event);
    handlers?.delete(handler);
  }

  async emit(event: string, ...data: any[]): Promise<void> {
    const handlers = this.#events.get(event);
    if (!handlers) return;

    // Use Promise.all for parallel execution of handlers
    await Promise.all([...handlers].map((handler) => handler(...data)));
  }
}

// Optimize queue with typed array for better performance
class Queue {
  private items: Function[] = [];
  private head = 0;
  private tail = 0;

  enqueue(fn: Function): void {
    this.items[this.tail++] = fn;
  }

  dequeue(): Function | undefined {
    if (this.head === this.tail) return undefined;
    const fn = this.items[this.head];
    delete this.items[this.head++];

    // Reset indices when queue is empty
    if (this.head === this.tail) {
      this.head = this.tail = 0;
    }
    return fn;
  }

  isEmpty(): boolean {
    return this.head === this.tail;
  }

  size(): number {
    return this.tail - this.head;
  }

  async runAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    while (!this.isEmpty()) {
      const fn = this.dequeue();
      if (fn) {
        promises.push(
          new Promise<void>((resolve) => {
            process.nextTick(async () => {
              await fn();
              resolve();
            });
          })
        );
      }
    }
    await Promise.all(promises);
  }
}

class ServeX<E extends Env = Env, P extends string = "/"> {
  private scope: Scope<E, RouteHandlerPair<E>>;
  #pluginManager: ServeXPluginManager<E>;
  #globals = new Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>();
  #__env__: () => E["Variables"] = () => process.env;
  #events = new EventManager();
  routes: RouterRoute<E>[] = [];
  #router = new RegExpRouter<RouteHandlerPair<E>>();
  #path: string = "";
  #queue = new Queue();
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
  #pluginResolved: boolean = false;

  constructor(options?: ServerOptions<E>) {
    const { plugins = [], basePath = "/" } = options || {};
    this._basePath = basePath;
    this.scope = createScope(this.#router);
    this.#pluginManager = new ServeXPluginManager(this, plugins);

    // Initialize method handlers
    this.#initMethodHandlers();

    // Initialize plugins
    this.#initPlugins();
  }

  #initMethodHandlers(): void {
    const methodHandler = (method: string) => {
      return (args1: string | Handler<E>, ...args: Handler<E>[]) => {
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
    };

    ALL_METHODS.forEach((method) => {
      this[method] = methodHandler(method);
    });
  }

  async #initPlugins(): Promise<void> {
    await this.#pluginManager.invokePlugins(this.scope);
    await this.#queue.runAll();
    this.#pluginResolved = true;
  }

  private dispatch = async (
    scope: Scope<E, RouteHandlerPair<E>>,
    request: Request,
    globals: Map<any, any>
  ) => {
    if (!this.#pluginResolved)
      return new Promise<Response>((resolve) => {
        this.#queue.enqueue(() => {
          this._dispatch(scope, request, globals).then(resolve);
        });
      });
    return await this._dispatch(scope, request, globals);
  };

  private _dispatch = async (
    scope: Scope<E, RouteHandlerPair<E>>,
    request: Request,
    globals: Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>
  ) => {
    const { method, url } = request;
    const { pathname, searchParams } = new URL(url);
    // Match using method and pathname separately
    const matchedRoute = scope.router.match(method, pathname);
    const handlers: Handler<E>[] = [];
    const params: Record<string, string> = {};
    let routeId: string =  '';

    const [h, stash = []] = matchedRoute;

    for (let i = 0; i < h.length; i++) {
      const [[handler, r], p] = h[i];
      routeId = r.path;
      
      for (const param in p) {
        if (!params[param]) {
          params[param] = stash[p[param] as number]
        }
      }

      handlers.push(handler);
    }

    const requestContext: RequestContext<E> = {
      routeId,
      params,
      query: searchParams,
      globals,
      path: pathname,
    };

    // Emit a server:request event
    // await this.#events.emit("server:request", requestContext, request);
    const ctx = new Context<E>(request, this.#__env__(), requestContext);

    const response = await executeHandlers<E>(ctx, handlers);
    // Emit a server:response event
    // await this.#events.emit("server:response", requestContext, response);
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

  use = (arg0: string | Handler<E>, ...handlers: Handler<E>[]) => {
    let path = "/";
    if (typeof arg0 === "string") {
      path = arg0;
    } else {
      handlers.unshift(arg0);
    }
    handlers.forEach((handler) => {
      this.addRoute("ALL", path, handler);
    });

    return this;
  };

  on = (...args: Parameters<EventManager["on"]>) => this.#events.on(...args);
}

export function createServer<E extends Env = Env>(options?: ServerOptions<E>) {
  return new ServeX<E>(options);
}

export type { ServeXInterface, ServeX };
