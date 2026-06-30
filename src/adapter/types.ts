import type { ServeXApp } from "../app";
import type { ListenCallback, Serve, Server } from "./server";
import type { ResponseSet } from "./utils";

// ─── Handler bag ──────────────────────────────────────────────────────────────

/**
 * Per-adapter response mapping functions.
 *
 * Adapters provide three mapping tiers (ported from Elysia's adapter pattern):
 *
 * - `mapResponse`       — full path: applies `set` (headers, status, cookies).
 * - `mapEarlyResponse`  — returns `undefined` for null/void (chain continues).
 * - `mapCompactResponse`— fastest path: no `set` applied at all.
 *
 * Having three separate functions lets the AOT compiler emit the cheapest
 * call site based on what it knows at compile time about the route's hooks.
 */
export interface ServeXAdapterHandler {
	/**
	 * Map **any** handler return value to a complete `Response`.
	 * Applies `set` (status, headers, cookies) unconditionally.
	 */
	mapResponse(response: unknown, set: ResponseSet, request?: Request): Response | Promise<Response>;

	/**
	 * Map a handler return value that may be `null` / `undefined`.
	 * Returns `undefined` when `response` is null/undefined so the
	 * caller can continue to the next handler.
	 */
	mapEarlyResponse(
		response: unknown,
		set: ResponseSet,
		request?: Request,
	): Response | undefined | Promise<Response | undefined>;

	/**
	 * Map a handler return value **without** applying any `set` overrides.
	 * Use only when you know no custom headers / status / cookies are set.
	 */
	mapCompactResponse(response: unknown, request?: Request): Response | Promise<Response>;

	/**
	 * Pre-compile a static (non-function) inline handler into a reusable
	 * `() => Response` factory.  Returns `undefined` if the handler is a
	 * function or when hooks prevent precompilation.
	 */
	createStaticHandler?(
		handle: unknown,
		hooks?: {
			parse?: unknown[];
			transform?: unknown[];
			beforeHandle?: unknown[];
			afterHandle?: unknown[];
		},
		setHeaders?: ResponseSet["headers"],
	): (() => Response) | undefined;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface ServeXAdapter {
	/** Unique identifier shown in error messages and debug output. */
	name: string;

	/**
	 * Binds the app's `fetch` handler to the underlying runtime server.
	 * Returns a factory that accepts port/options + optional callback.
	 */
	listen: (
		app: ServeXApp<any, any, any>,
	) => (
		options: string | number | Partial<Serve>,
		callback?: ListenCallback,
	) => Server;

	/**
	 * Per-adapter response mapping functions.
	 *
	 * Optional for backwards compatibility — adapters that do not supply a
	 * `handler` bag will fall through to the built-in response handling in
	 * `core/fetch.ts`. New adapters **should** always provide this.
	 */
	handler?: ServeXAdapterHandler;

	/**
	 * Serve a local file path.
	 * Bun: `new Response(Bun.file(path))`
	 * Others: not supported by default.
	 */
	staticFile?: (path: string) => Response;
}
