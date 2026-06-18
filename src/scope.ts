import type { RouterAdapter } from "./router/adapter";
import type { ServerRoute } from "./types";

class Scope<T extends ServerRoute[], P extends ServerRoute[] = ServerRoute[]> {
  router: RouterAdapter<T>;
  parent: Scope<P> | null;

  constructor(rm: RouterAdapter<T>,
    parent?: Scope<P>
  ) {
    this.router = rm;
    this.parent = parent || null;
  }
}

export function createScope<T extends any[]>(rm: RouterAdapter<T>) {
  return new Scope<T>(rm);
}

export {
  type Scope
}