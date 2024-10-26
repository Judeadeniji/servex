import type { Context } from "./context";
import type { RouterAdapter } from "./router/adapter";
import type { Env, ServerRoute } from "./types";

let currentScope: Scope<any> | null = null;

class Scope<E extends Env, P extends ServerRoute[] = ServerRoute[]> {
  router: RouterAdapter<E>;
  context: Context<E> = null!;
  parent: Scope<E, P> | null;

  constructor(routerAdapter: RouterAdapter<E>,
    parent?: Scope<E, P>
  ) {
    this.router = routerAdapter;
    this.parent = parent || null;
  }
}

export function getCurrentScope<E extends Env, P extends ServerRoute[] = ServerRoute[]>() {
  if (currentScope === null) {
    throw new Error("No scope found");
  }
  return currentScope as unknown as Scope<E, P>;
}

export function createScope<E extends Env>(rm: RouterAdapter<E>) {
  const scope = new Scope<E>(rm);

  currentScope = scope;

  return scope;
}

export function setScope<E extends Env>(scope: Scope<E>) {
  currentScope = scope
}

export function disposeScope() {
  currentScope = null;
}

export {
  type Scope
}