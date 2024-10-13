// RouterAdapter.ts
import type { Context, MiddlewareHandler } from "../types";
import type { HTTPMethod, IRouter, MatchedRoute, Route } from "./base";
import { RadixRouteTrie } from "./radix-router";
import { TrieRouter } from "./trie-router";
import type { DynamicSegmentsRemoved, RouteMatch } from "./types";

/**
 * Enum to define available router types.
 */
export enum RouterType {
  TRIE = "TRIE",
  RADIX = "RADIX",
}

/**
 * Configuration options for the RouterAdapter.
 */
export interface RouterAdapterOptions<Routes extends Route[] = Route[]> {
  type: RouterType;
  routes?: Routes;
}

/**
 * Adapter that allows switching between different router implementations.
 */
export class RouterAdapter<Routes extends Route[] = Route[]> implements IRouter<Routes> {
  private router: IRouter<Routes>;

  constructor(options: RouterAdapterOptions<Routes>) {
    const { type, routes = [] } = options;

    switch (type) {
      case RouterType.RADIX:
        this.router = new RadixRouteTrie<Routes>();
        break;
      case RouterType.TRIE:
      default:
        this.router = new TrieRouter<Routes>();
        break;
    }

    // Register initial routes if provided
    for (const route of routes) {
      this.addRoute(route);
    }
  }

  /**
   * Adds a new route by delegating to the underlying router.
   * @param route - The route to add.
   */
  addRoute(route: Route<Routes[number]["data"]>): void {
    this.router.addRoute(route);
  }

  /**
   * Matches a URL by delegating to the underlying router.
   * @param method - The HTTP method.
   * @param url - The URL to match.
   * @returns The matched route or null if no match is found.
   */
  match<
    RoutePath extends DynamicSegmentsRemoved<Routes[number]["path"]>,
    Matched = RouteMatch<Routes[number]["path"], RoutePath>
  >(
    method: HTTPMethod,
    url: RoutePath
  ): MatchedRoute<Routes, boolean> | null {
    return this.router.match(method, url);
  }

  /**
   * Retrieves all registered routes by delegating to the underlying router.
   * @returns An array of all routes.
   */
  get routes(): Route<Routes[number]["data"]>[] {
    return this.router.routes;
  }

  /**
   * Switches the underlying router implementation at runtime.
   * Note: Existing routes will need to be re-registered if switching after initialization.
   * @param type - The new router type to switch to.
   */
  switchRouter(type: RouterType): void {
    if (this.router instanceof RadixRouteTrie && type === RouterType.TRIE) {
      const newRouter = new TrieRouter<Routes>();
      // Re-register all routes from RadixRouteTrie to TrieRouter
      for (const route of this.router.routes) {
        newRouter.addRoute(route);
      }
      this.router = newRouter;
    } else if (this.router instanceof TrieRouter && type === RouterType.RADIX) {
      const newRouter = new RadixRouteTrie<Routes>();
      // Re-register all routes from TrieRouter to RadixRouteTrie
      for (const route of this.router.routes) {
        newRouter.addRoute(route);
      }
      this.router = newRouter;
    } else {
      console.warn(`Router is already of type ${type} or unsupported type.`);
    }
  }

  /**
   * Adds a sub-trie to the parent route.
   * @param parent - The parent route path.
   * @param trie - The sub-trie to add.
   * @returns The parent route with the sub-trie added.
   */
  addSubTrie(parent: string, trie: IRouter<Routes>): IRouter<Routes> {
    return this.router.addSubTrie(parent, trie);
  }

  pushMiddlewares<C extends Context>(path: string, middlewares: MiddlewareHandler<C>[]): void {
    this.router.pushMiddlewares(path, middlewares);
  }
}
