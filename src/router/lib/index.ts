"use strict";

import { Context } from "../../context";
import type { Env, Handler } from "../../types";
/**
 * Module dependencies.
 * @private
 */
import Layer from "./layer";
import Route from "./route";

/**
 * Utility functions
 * @private
 */
const slice = Array.prototype.slice;
const flatten = Array.prototype.flat;

// Expose Router and Route
export { Router, Route };

interface RouterOptions {
  caseSensitive?: boolean;
  mergeParams?: boolean;
  strict?: boolean;
}

type Middleware = (req: Request, res: Response, next: Function) => void;

/**
 * Router class
 */
class Router<E extends Env = Env> {
  public caseSensitive?: boolean;
  public mergeParams?: boolean;
  public params: Record<string, any> = {};
  public strict?: boolean;
  public stack: Layer<E>[] = [];

  constructor(options: RouterOptions = {}) {
    this.caseSensitive = options.caseSensitive;
    this.mergeParams = options.mergeParams;
    this.strict = options.strict;
  }

  /**
   * Handle a request with a callback
   */
  public async handle(req: Request, callback: Function) {
    let idx = 0;
    const stack = this.stack.toSorted(
      (a, b) => b.parts.length - a.parts.length
    ); // longest first
    const url = new URL(req.url);
    const path = url.pathname;
    let done = callback;

    async function next(err?: any) {
      let layerError = err === "route" ? null : err;

      if (layerError === "router") {
        setImmediate(() => {
          done();
        }, null);
        return;
      }

      if (idx >= stack.length) {
        setImmediate(() => {
          done();
        }, layerError);
        return;
      }

      const layer = stack[idx++];
      const match = layer.match(path);
      const route = layer.route;

      if (!match || (route && layerError)) {
        return await next(layerError);
      }

      if (route) {
        const c = new Context<E>(req, process.env, {
          globals: new Map(),
          params: match.params!,
          path: layer.path,
          parsedBody: undefined,
          query: url.searchParams,
        });
        return await layer.handleRequest(c, next);
      }
    }

    return next();
  }

  /**
   * Use a middleware function with an optional path.
   */
  public use(path: string | Middleware, ...handlers: Middleware[]) {
    if (typeof path === "function") {
      handlers.unshift(path);
      path = "/";
    }

    for (const handler of flatten.call(handlers, Infinity)) {
      if (typeof handler !== "function")
        throw new TypeError("Handler must be a function");
      const layer = new Layer<E>(
        path as string,
        { end: false, sensitive: this.caseSensitive, strict: false },
        handler
      );
      this.stack.push(layer);
    }

    return this;
  }

  /**
   * Create a new Route for the given path.
   */
  public route(path: string) {
    const route = new Route<E>(path);
    const layer = new Layer<E>(
      path,
      { end: true, sensitive: this.caseSensitive, strict: this.strict },
      route.dispatch.bind(route)
    );
    layer.route = route;
    this.stack.push(layer);
    return route;
  }

  all<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.all(...handlers);
    return this;
  }

  // Explicitly defining each HTTP method
  get<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.get(...handlers);
    return this;
  }

  post<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.post(...handlers);
    return this;
  }

  put<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.put(...handlers);
    return this;
  }

  delete<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.delete(...handlers);
    return this;
  }

  patch<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.patch(...handlers);
    return this;
  }

  options<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.options(...handlers);
    return this;
  }

  head<S extends string>(path: S, ...handlers: Handler<E, S>[]): this {
    const route = this.route(path);
    route.head(...handlers);
    return this;
  }
}

// Define HTTP methods dynamically
// (['get', 'post', 'put', 'delete', 'patch', 'all'] as RequestMethod[]).forEach((method) => {
//   Router.prototype[method] = function (path: string, path: string, ...handlers: Middleware[]) {
//     const route = this.route(path);
//     route[method](...handlers);
//     return this;
//   };
// });

export default Router;
