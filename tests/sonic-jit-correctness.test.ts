import { describe, expect, it } from "bun:test";
import type { MatchedRoute } from "../src/router/base";
import { SonicRouter } from "../src/router/sonic-router";
import type { Handler } from "../src/types";

function getParams(match: MatchedRoute | null) {
	if (!match) return undefined;
	if (match.params) return match.params;
	const p: Record<string, string> = {};
	const keys = match.store?.paramsKeys as string[];
	if (keys && match.paramValues) {
		for (let i = 0; i < keys.length; i++) {
			p[keys[i]] = match.paramValues[i];
		}
	}
	return p;
}

describe("SonicRouter JIT - Correctness & Param Extraction", () => {
	it("extracts simple param correctly", () => {
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/users/:id",
			handlers: { route: 1 },
		});
		const match = router.match("GET", "/users/123");
		expect(getParams(match)).toEqual({ id: "123" });
	});

	it("extracts multiple params correctly", () => {
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/posts/:postId/comments/:commentId",
			handlers: { route: 1 },
		});
		const match = router.match("GET", "/posts/abc/comments/def");
		expect(getParams(match)).toEqual({ postId: "abc", commentId: "def" });
	});

	it("extracts wildcard correctly and absorbs slashes", () => {
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/public/*path",
			handlers: { route: 1 },
		});
		const match = router.match("GET", "/public/assets/css/style.css");
		expect(getParams(match)).toEqual({ path: "assets/css/style.css" });
	});

	it("extracts correct params when multiple routes overlap (correct group indices)", () => {
		const router = new SonicRouter();
		// These compile into a single regex with multiple capturing groups.
		// The JIT must extract from the correct offset.
		router.addRoute({
			method: "GET",
			path: "/api/v1/:resource",
			handlers: { route: "v1" },
		});
		router.addRoute({
			method: "GET",
			path: "/api/v2/:resource/:id",
			handlers: { route: "v2" },
		});

		const match1 = router.match("GET", "/api/v1/users");
		expect(match1?.handlers as unknown).toEqual({ route: "v1" });
		expect(getParams(match1)).toEqual({ resource: "users" });

		const match2 = router.match("GET", "/api/v2/posts/99");
		expect(match2?.handlers as unknown).toEqual({ route: "v2" });
		expect(getParams(match2)).toEqual({ resource: "posts", id: "99" });
	});

	it("extracts params correctly even when a less specific route is defined first", () => {
		const router = new SonicRouter();
		// Wildcard is less specific, should be tested *after* the param route by the JIT regex
		router.addRoute({
			method: "GET",
			path: "/api/*all",
			handlers: { route: "wild" },
		});
		router.addRoute({
			method: "GET",
			path: "/api/users/:id",
			handlers: { route: "param" },
		});

		const matchParam = router.match("GET", "/api/users/42");
		expect(matchParam?.handlers as unknown).toEqual({ route: "param" });
		expect(getParams(matchParam)).toEqual({ id: "42" });

		const matchWild = router.match("GET", "/api/other/thing");
		expect(matchWild?.handlers as unknown).toEqual({ route: "wild" });
		expect(getParams(matchWild)).toEqual({ all: "other/thing" });
	});
});

describe("SonicRouter - sanitizeRoute encoding semantics", () => {
	/**
	 * sanitizeRoute() strips leading/trailing slashes only.
	 * It does NOT percent-encode. These tests document exactly what the
	 * router guarantees and what it doesn't — so that future changes can't
	 * silently regress either side of the contract.
	 */

	it("matches pre-encoded URLs correctly (the common HTTP case)", () => {
		// HTTP clients encode non-ASCII before sending. Routes should be registered
		// in their percent-encoded form if you expect pre-encoded requests.
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/search/:query",
			handlers: 1,
		});

		// Standard ASCII — always works
		const m1 = router.match("GET", "/search/typescript");
		expect(getParams(m1)).toEqual({ query: "typescript" });

		// Pre-encoded (what a browser actually sends for "hello world")
		const m2 = router.match("GET", "/search/hello%20world");
		expect(getParams(m2)).toEqual({ query: "hello%20world" });
		// Note: the caller receives the raw (still-encoded) segment.
		// Decoding is the handler's responsibility, matching sanitizeRoute's contract.
	});

	it("does NOT double-encode a pre-encoded URL (old encodeURI bug is gone)", () => {
		// Old sanitizeRoute called encodeURI(), which would encode % to %25.
		// This meant /caf%C3%A9 would become caf%25C3%25A9 internally and never match.
		// The new implementation does not have this bug.
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/users/:name",
			handlers: 1,
		});

		const match = router.match("GET", "/users/caf%C3%A9");
		expect(match).not.toBeNull();
		expect(getParams(match)).toEqual({ name: "caf%C3%A9" });
	});

	it("raw non-ASCII in route and URL matches consistently", () => {
		// If a developer registers with raw unicode AND requests come in with raw bytes,
		// they match each other. sanitizeRoute is consistent: same transformation
		// applied to both sides.
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/café",
			handlers: 1,
		});

		const match = router.match("GET", "/café");
		expect(match).not.toBeNull();
	});

	it("double slashes in path are preserved (not collapsed)", () => {
		// sanitizeRoute strips leading/trailing slashes only; internal // are unchanged.
		// A route with // in it would not match a URL with single /.
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/users/:id",
			handlers: 1,
		});

		// /users//123 has an extra slash — should NOT match /users/:id
		const match = router.match("GET", "/users//123");
		expect(match).toBeNull();
	});

	it("trailing slash and no trailing slash both match the same route", () => {
		const router = new SonicRouter();
		router.addRoute({
			method: "GET",
			path: "/about",
			handlers: 1,
		});

		expect(router.match("GET", "/about")).not.toBeNull();
		expect(router.match("GET", "/about/")).not.toBeNull();
	});

	it("KNOWN LIMITATION: raw-unicode and percent-encoded forms of the same route are distinct", () => {
		// sanitizeRoute strips slashes only — it does not decode or normalize encoding.
		// A route registered as /café (raw unicode) will NOT match a request arriving
		// as /caf%C3%A9 (percent-encoded), and vice versa. These are two different byte
		// strings after sanitization.
		//
		// This is consistent with how most production routers behave (hono, fastify, express
		// all require consistent encoding between registration and request). URL normalization
		// should happen at the reverse proxy/CDN layer before requests reach the application.
		const router = new SonicRouter();
		const rawFn = (() => {}) as unknown as Handler;
		router.addRoute({ method: "GET", path: "/café", handlers: [rawFn] });

		// Raw unicode request matches raw unicode route
		const handlers = router.match("GET", "/café")?.handlers;
		expect(Array.isArray(handlers) ? handlers[0] : handlers).toBe(rawFn);

		// Pre-encoded request does NOT match the raw unicode route (expected: null)
		expect(router.match("GET", "/caf%C3%A9")).toBeNull();

		// To match both forms, register the percent-encoded path and decode in the handler,
		// or normalize at the reverse proxy layer.
	});
});
