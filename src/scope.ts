import type { Context } from "./context";
import type { RouterAdapter } from "./router/adapter";
import type { ServerRoute } from "./types";

let currentScope: Scope<ServerRoute[]> | null = null;

class Scope<T extends ServerRoute[], P extends ServerRoute[] = ServerRoute[]> {
  route_matcher: RouterAdapter<T>;
  context: Context = null!;
  parent: Scope<P> | null;

  constructor(rm: RouterAdapter<T>,
    parent?: Scope<P>
  ) {
    this.route_matcher = rm;
    this.parent = parent || null;
  }
}

export function getCurrentScope<T extends ServerRoute[], P extends ServerRoute[] = ServerRoute[]>() {
  if (currentScope === null) {
    throw new Error("No scope found");
  }
  return currentScope as Scope<T, P>;
}

export function createScope<T extends any[]>(rm: RouterAdapter<T>) {
  const scope = new Scope<T>(rm);

  currentScope = scope;

  return scope;
}

export function setScope<T extends any[]>(scope: Scope<T>) {
  currentScope = scope
}

export function disposeScope() {
  currentScope = null;
}

export {
  type Scope
}