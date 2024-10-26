// middleware.ts

import { executeHandlers } from "../core/response";
import type { MiddlewareHandler, Env, NextFunction, Handler, Context } from "../types";

export class MiddlewareManager<E extends Env> {
  private middlewares: MiddlewareHandler<E>[] = [];

  use(middleware: MiddlewareHandler<E>) {
    this.middlewares.push(middleware);
  }

  async execute(context: Context<E>) {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      const middleware = this.middlewares[i];
      if (middleware) {
        await middleware(context, () => dispatch(i + 1));
      }
    };

    await dispatch(0);
  }
}

// flatten handlers into one single fu
export function flattenHandlers<E extends Env>(handlers: Handler<E>[]) {
  return ((context: Context<E>, n: NextFunction) => {
    return executeHandlers<E>(context, handlers as Handler<E>[]);
  }) as Handler<E>;
}
