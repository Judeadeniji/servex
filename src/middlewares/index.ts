// middleware.ts

import type { Middleware, Context, NextFunction } from "../types";

export class MiddlewareManager<T extends Context> {
  private middlewares: Middleware<T>[] = [];

  use(middleware: Middleware<T>) {
    this.middlewares.push(middleware);
  }

  async execute(context: T) {
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
