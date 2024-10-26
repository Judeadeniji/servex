import type { Context } from "./context";
import {type Router} from "./router/types";
import type { Env, Handler } from "./types";

let currentScope: Scope<any, any, string> | null = null;

class Scope<E extends Env, T, P extends string = "/"> {
  router: Router<T>;
  context: Context<E> = null!;
  parent: Scope<E, T, P> | null;

  constructor(router: Router<T>,
    parent?: Scope<E, T, P>
  ) {
    this.router = router;
    this.parent = parent || null;
  }
}

export function getCurrentScope<E extends Env, P extends string>() {
  if (currentScope === null) {
    throw new Error("No scope found");
  }
  return currentScope as unknown as Scope<E, P>;
}

export function createScope<E extends Env, P extends string, T>(router: Router<T>) {
  const scope = new Scope<E, T, P>(router);

  currentScope = scope;

  return scope;
}

export function setScope<E extends Env, P extends string>(scope: Scope<E, P>) {
  currentScope = scope
}

export function disposeScope() {
  currentScope = null;
}

export {
  type Scope
}