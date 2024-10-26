import Layer from "./layer";
import type { Context } from "../../context";
import type { Env, Handler } from "../../types";
import type { HTTPMethod } from "../base";

export default class Route<E extends Env> {
  path: string;
  stack: Layer<E>[] = [];

  constructor(path: string) {
    this.path = path;
  }

  dispatch(c: Context<E>, next: Function): Response | void {
    let idx = 0;

    const nextLayer = (err?: any) => {
      const layer = this.stack[idx++];
      if (!layer) {
        return next(err);
      }

      try {
        if (err) {
          return layer.handleError(err);
        } else {
          return layer.handleRequest(c, nextLayer);
        }
      } catch (error) {
        return next(error);
      }
    };

    return nextLayer();
  }

  addLayer(method: HTTPMethod, fn: Handler<E>): this {
    const layer = new Layer<E>(this.path, { method }, fn);
    this.stack.push(layer);
    return this;
  }

  all(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("ALL", handler));
    return this;
  }

  // Explicitly defining each HTTP method
  get(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("GET", handler));
    return this;
  }

  post(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("POST", handler));
    return this;
  }

  put(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("PUT", handler));
    return this;
  }

  delete(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("DELETE", handler));
    return this;
  }

  patch(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("PATCH", handler));
    return this;
  }

  options(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("OPTIONS", handler));
    return this;
  }

  head(...handlers: Handler<E>[]): this {
    handlers.forEach((handler) => this.addLayer("HEAD", handler));
    return this;
  }
}
