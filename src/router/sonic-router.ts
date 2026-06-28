import * as $$path from "node:path";
import type { Context, MiddlewareHandler } from "../types";
import type { HTTPMethod, IRouter, MatchedRoute, Route } from "./base";
import { compileSonicTrieMatcher } from "./sonic-trie-jit";


const createNoMatch = (is405: boolean): MatchedRoute => ({
	matched: false,
	method: undefined,
	route: undefined,
	matched_route: undefined,
	params: null,
	handlers: undefined,
	store: undefined,
	executor: undefined,
	is405,
});

export type SonicRouteNode = {
	method: HTTPMethod;
	path: string;
	handlers: import("../types").InternalHandler<Context>[];
	paramsKeys: string[];
	middlewares: MiddlewareHandler<Context>[];
	staticMatchResult?: MatchedRoute<Route[], boolean> | null;
	isStatic?: boolean;
	isWildcard?: boolean;
	staticPrefix?: string;
	children?: SonicRouteNode[];
	store?: Record<string, unknown>;
};

/**
 * Specificity rank for a single path segment.
 * Lower rank = more specific = should be tried first in matching.
 *
 *   0 -> static segment      e.g. "users"
 *   1 -> named param         e.g. ":id"
 *   2 -> wildcard / catch-all e.g. "*rest"
 */
function segmentRank(segment: string): 0 | 1 | 2 {
	if (segment.startsWith(":")) return 1;
	if (segment.startsWith("*")) return 2;
	return 0;
}

/**
 * Compares two dynamic route nodes for matching precedence.
 *
 * Rule: walk both paths segment-by-segment, left to right. The first
 * segment where the two routes differ in specificity (static < param <
 * wildcard) decides the winner. Ties fall back to longer-path-wins, then
 * registration order (via sort's stability).
 *
 * NOTE: now that dynamic matching is trie-based (see compile() below),
 * precedence among literal/param/wildcard siblings falls out of the trie
 * structure itself — a real trie naturally tries literal children before
 * the param child before the wildcard child at every branching point, with
 * no global ordering needed. This sort is kept anyway for two reasons:
 * (1) it makes route registration order irrelevant to trie-build, so the
 * resulting trie's shape is deterministic regardless of call order, which
 * keeps generated code diffs stable/reviewable, and (2) it's the existing,
 * tested contract — removing it is a separate decision from the regex ->
 * trie migration and shouldn't be bundled into this change.
 */
// fallow-ignore-next-line unused-param Node is checked for structural properties
export function isSonicRouteNode(node: unknown): node is SonicRouteNode {
	return (
		typeof node === "object" &&
		node !== null &&
		"method" in node &&
		"path" in node
	);
}

export function compareRouteSpecificity(
	a: SonicRouteNode,
	b: SonicRouteNode,
): number {
	const aSegs = a.path === "" ? [""] : a.path.split("/");
	const bSegs = b.path === "" ? [""] : b.path.split("/");
	const len = Math.min(aSegs.length, bSegs.length);

	for (let i = 0; i < len; i++) {
		const ra = segmentRank(aSegs[i]);
		const rb = segmentRank(bSegs[i]);
		if (ra !== rb) return ra - rb;
	}

	if (aSegs.length !== bSegs.length) {
		return bSegs.length - aSegs.length;
	}

	return 0;
}

/**
 * SonicRouter is an ultra-fast, JIT-compiled router implementation.
 *
 * Static routes (no ":" or "*" segments) are stored in a plain object map
 * and matched in O(1) via direct property lookup — always checked first,
 * so static routes always win over dynamic ones by construction.
 *
 * Dynamic routes are compiled, at boot/registration time, into a single
 * flat JS match function generated from a trie (see ./sonic-trie-jit.ts)
 * — no regex involved. Precedence among dynamic routes (static-segment >
 * param-segment > wildcard-segment, resolved left-to-right) is enforced
 * both by the specificity sort below AND structurally by the trie's
 * branch-ordering (literal children, then param, then wildcard, at every
 * node) — see sonic-trie-jit.ts's module docblock for the backtracking
 * correctness notes, which are the main risk area of this approach.
 */
export class SonicRouter implements IRouter {
	private _routes: Route[] = [];

	// routesByMethod[method] -> array of nodes, in raw registration order.
	// Compile-time specificity sorting happens on a *copy* of this array in
	// compile(), so registration order is preserved here for introspection.
	private routesByMethod: Record<string, SonicRouteNode[]> = {};

	// compiled match functions, keyed by method
	private matchFns: Record<
		string,
		(url: string, method: string) => MatchedRoute | null
	> = {};

	private staticRoutes: Record<
		string,
		Record<string, MatchedRoute>
	> = {};

	private isDirty: Record<string, boolean> = {};

	private pathMiddlewares: {
		path: string;
		middlewares: MiddlewareHandler<Context>[];
	}[] = [];

	get routes(): Route[] {
		return this._routes;
	}

	/** Expose compiled match functions for profiling/testing. */
	get _matchFns() {
		return this.matchFns;
	}

	addRoute(route: Route): void {
		this._routes.push(route);
		const { method, path, handlers } = route;
		const sanitizedPath = this.sanitizeRoute(path);

		const node: SonicRouteNode = {
			method,
			path: sanitizedPath,
			handlers,
			paramsKeys: [],
			middlewares: [],
			store: {},
		};

		for (const pm of this.pathMiddlewares) {
			if (
				pm.path === "*" ||
				pm.path === "" ||
				sanitizedPath.startsWith(pm.path)
			) {
				node.middlewares.push(...pm.middlewares);
			}
		}

		if (Array.isArray(handlers)) {
			node.handlers = [...node.middlewares, ...handlers];
		} else {
			node.handlers = handlers;
		}

		if (!this.routesByMethod[method]) this.routesByMethod[method] = [];

		const parts = sanitizedPath === "" ? [""] : sanitizedPath.split("/");
		for (const p of parts) {
			if (p.startsWith(":")) {
				node.paramsKeys.push(p.slice(1));
			} else if (p.startsWith("*")) {
				node.paramsKeys.push(p.length > 1 ? p.slice(1) : "path");
			}
		}
		this.routesByMethod[method].push(node);
		this.isDirty[method] = true;
	}

	/**
	 * Compiles the dynamic-route trie for `method` into a flat match
	 * function via sonic-trie-jit.ts, and stores it in `matchFns`.
	 *
	 * This replaces the previous regex-alternation approach entirely.
	 * `this.matchFns[method]` has the exact same call signature as before
	 * (`(sanitized, url, method) => MatchedRoute | null`), so `match()`
	 * below is unchanged.
	 */
	private compile(method: HTTPMethod) {
		if (!this.isDirty[method]) return;
		this.isDirty[method] = false;

		const rawRoutes = this.routesByMethod[method] || [];
		if (rawRoutes.length === 0) return;

		const dynamicRoutes: SonicRouteNode[] = [];

		for (const route of rawRoutes) {
			if (route.paramsKeys.length === 0) {
				const matchObj: MatchedRoute = {
					matched: true,
					method: method,
					route: route,
					matched_route: route.path,
					params: null,
					handlers: route.handlers,
					store: route,
					executor: undefined,
					is405: false,
				};

				const p = route.path;
				const setStaticRoute = (pathKey: string) => {
					if (!this.staticRoutes[pathKey]) this.staticRoutes[pathKey] = {};
					this.staticRoutes[pathKey][method] = matchObj;
				};

				if (p === "") {
					setStaticRoute("/");
				} else {
					setStaticRoute(`/${p}`);
					setStaticRoute(`/${p}/`);
				}
			} else {
				dynamicRoutes.push(route);
			}
		}

		// Sort a COPY by specificity — see compareRouteSpecificity's docblock
		// for why this is kept even though the trie also enforces precedence
		// structurally.
		const sortedRoutes = dynamicRoutes.slice().sort(compareRouteSpecificity);

		const { matchFn } = compileSonicTrieMatcher<SonicRouteNode>(
			method,
			sortedRoutes,
		);

		this.matchFns[method] = matchFn;
	}

	match(
		method: HTTPMethod,
		url: string,
	): MatchedRoute | null {
		this.compile(method);

		const p = url as string;
		const staticMatchMap = this.staticRoutes[p];
		if (staticMatchMap) {
			const staticMatch = staticMatchMap[method];
			if (staticMatch) return staticMatch;
			return createNoMatch(true);
		}

		const dynamicMatchFn = this.matchFns[method];
		if (dynamicMatchFn) {
			const m = dynamicMatchFn(p, method);
			if (m) return m;
		}
		
		// 405 check for dynamic routes: check other compiled methods
		for (const m in this.matchFns) {
			if (m !== method) {
				const fn = this.matchFns[m];
				if (fn?.(p, m)) {
					return createNoMatch(true);
				}
			}
		}

		return null;
	}

	addSubTrie(parent: string, trie: IRouter): IRouter {
		const sanitizedPath = this.sanitizeRoute(parent);
		const routes = trie.routes.map((route) => {
			route.path = $$path.join(sanitizedPath, route.path);
			return route;
		});

		for (const route of routes) {
			this.addRoute(route);
		}
		return this;
	}

	pushMiddlewares(
		path: string,
		middlewares: MiddlewareHandler<Context>[],
	): void {
		const sanitized = this.sanitizeRoute(path);
		this.pathMiddlewares.push({
			path: sanitized,
			middlewares: middlewares as MiddlewareHandler<Context>[],
		});

		if (sanitized === "*" || sanitized === "") {
			for (const method in this.routesByMethod) {
				for (const node of this.routesByMethod[method]) {
					if (middlewares.length > 0) {
						node.middlewares.push(
							...(middlewares as MiddlewareHandler<Context>[]),
						);
					}
				}
			}
		} else {
			for (const method in this.routesByMethod) {
				for (const node of this.routesByMethod[method]) {
					if (
						node.path === sanitized ||
						node.path.startsWith(`${sanitized}/`)
					) {
						if (middlewares.length > 0) {
							node.middlewares.push(
								...(middlewares as MiddlewareHandler<Context>[]),
							);
						}
					}
				}
			}
		}
	}

	/**
	 * Strips the leading and trailing `/` from a route or URL path.
	 * (Unchanged from the previous fix — see that commit's notes on why
	 * encodeURI() was removed and what the encoding contract is.)
	 */
	private sanitizeRoute(route: string): string {
		if (route === "/" || route === "") return "";
		let s = 0,
			e = route.length;
		if (route.charCodeAt(0) === 47 /* "/" */) s = 1;
		if (e > s && route.charCodeAt(e - 1) === 47 /* "/" */) e -= 1;
		return s === 0 && e === route.length ? route : route.slice(s, e);
	}
}
