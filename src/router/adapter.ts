// RouterAdapter.ts
import type { Context, MiddlewareHandler } from "../types";
import type { HTTPMethod, IRouter, MatchedRoute, Route } from "./base";
import { RadixRouteTrie } from "./radix-router";
import { SonicRouter } from "./sonic-router";
import { TrieRouter } from "./trie-router";

/**
 * Enum to define available router types.
 */
export enum RouterType {
	TRIE = "TRIE",
	RADIX = "RADIX",
	SONIC = "SONIC",
}

/**
 * Configuration options for the RouterAdapter.
 */
export interface RouterAdapterOptions {
	type: RouterType;
	routes?: Route[];
}

/**
 * Adapter that allows switching between different router implementations.
 *
 * This is the single public boundary for routing — it is the only place that
 * needs to know about the concrete router implementations. The underlying
 * routers (`TrieRouter`, `RadixRouteTrie`, `SonicRouter`) are internal
 * details with no user-facing generics.
 */
export class RouterAdapter {
	private router: IRouter;
	public readonly type: RouterType;

	// fallow-ignore-next-line unused-param Required by Router constructor signature
	constructor(options: RouterAdapterOptions) {
		const { type, routes = [] } = options;
		this.type = type;

		switch (type) {
			case RouterType.SONIC:
				this.router = new SonicRouter();
				break;
			case RouterType.RADIX:
				this.router = new RadixRouteTrie();
				break;
			default:
				this.router = new TrieRouter();
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
	addRoute(route: Route): void {
		this.router.addRoute(route);
	}

	/**
	 * Matches a URL by delegating to the underlying router.
	 * @param method - The HTTP method.
	 * @param url - The URL to match.
	 * @returns The matched route or null if no match is found.
	 */
	match(method: HTTPMethod, url: string): MatchedRoute | null {
		return this.router.match(method, url);
	}

	/**
	 * Retrieves all registered routes by delegating to the underlying router.
	 * @returns An array of all routes.
	 */
	get routes(): Route[] {
		return this.router.routes;
	}

	/**
	 * Switches the underlying router implementation at runtime.
	 * Note: Existing routes will need to be re-registered if switching after initialization.
	 * @param type - The new router type to switch to.
	 */
	switchRouter(type: RouterType): void {
		if (this.router instanceof RadixRouteTrie && type === RouterType.TRIE) {
			const newRouter = new TrieRouter();
			// Re-register all routes from RadixRouteTrie to TrieRouter
			for (const route of this.router.routes) {
				newRouter.addRoute(route);
			}
			this.router = newRouter;
		} else if (this.router instanceof TrieRouter && type === RouterType.RADIX) {
			const newRouter = new RadixRouteTrie();
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
	addSubTrie(parent: string, trie: IRouter): IRouter {
		return this.router.addSubTrie(parent, trie);
	}

	pushMiddlewares(
		path: string,
		middlewares: MiddlewareHandler<Context>[],
	): void {
		this.router.pushMiddlewares(path, middlewares);
	}
}
