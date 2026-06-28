/**
 * Profiles where SonicRouter's realistic-mix time actually goes.
 * Splits the work into isolated layers:
 *   1. Full router.match() — baseline
 *   2. Static map lookup only
 *   3. JIT matchFn (regex.exec + param extraction + object creation)
 *   4. regex.exec() alone
 *   5. Overhead = (3) - (4): cost of param extraction + object alloc
 */

import { bench, run } from "mitata";
import type { Route } from "../../src/router/base";
import { SonicRouter } from "../../src/router/sonic-router";

const routes: Route[] = [
	{
		method: "GET",
		path: "/",
		handlers: [1 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/about",
		handlers: [2 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/health",
		handlers: [3 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/config",
		handlers: [4 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/login",
		handlers: [5 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/register",
		handlers: [6 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/dashboard",
		handlers: [7 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/pricing",
		handlers: [8 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/contact",
		handlers: [9 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/terms",
		handlers: [10 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/users/:id",
		handlers: [11 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/posts/:slug",
		handlers: [12 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/products/:sku",
		handlers: [13 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/u/:username",
		handlers: [14 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/c/:category",
		handlers: [15 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/download/:fileId",
		handlers: [16 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/docs/:page",
		handlers: [17 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/events/:eventId",
		handlers: [18 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/orgs/:orgId",
		handlers: [19 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/settings/:section",
		handlers: [20 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/posts/:id/comments/:commentId",
		handlers: [21 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/orgs/:orgId/teams/:teamId/members/:memberId",
		handlers: [22 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/repo/:owner/:repo/issues/:issueId",
		handlers: [23 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/store/:country/:state/:city",
		handlers: [24 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/flights/:origin/:dest/:date",
		handlers: [25 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/public/*path",
		handlers: [26 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/assets/*path",
		handlers: [27 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/images/*path",
		handlers: [28 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/api/legacy/*path",
		handlers: [29 as unknown as import("../../src/types").Handler],
	},
	{
		method: "GET",
		path: "/proxy/*path",
		handlers: [30 as unknown as import("../../src/types").Handler],
	},
];

const requestMix = [
	"/", // static hit
	"/api/health", // static hit
	"/api/users/999", // dynamic: 1 param
	"/repo/microsoft/typescript/issues/1234", // dynamic: 3 params
	"/public/css/main.css", // dynamic: wildcard
	"/flights/JFK/LAX/2026-10-31", // dynamic: 3 params
	"/contact", // static hit
	"/assets/js/app.bundle.js", // dynamic: wildcard
	"/api/not-found", // 404 — no match
	"/repo/owner-only/no-repo", // 404 partial
];

const router = new SonicRouter();
for (const r of routes) router.addRoute(r);

// Force compile
router.match("GET", "/api/users/1");

const matchFn = router._matchFns.GET;

console.log(`Routes: ${routes.length} (10 static, 15 param, 5 wildcard)`);
console.log(`Request mix: ${requestMix.length} URLs\n`);

bench("Full router.match() — all URLs", () => {
	for (const u of requestMix) router.match("GET", u);
});

bench("JIT matchFn() — all URLs", () => {
	for (const u of requestMix) matchFn(u, "GET");
});

await run();
