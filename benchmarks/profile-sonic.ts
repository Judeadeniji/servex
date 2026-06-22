/**
 * Profiles where SonicRouter's realistic-mix time actually goes.
 * Splits the work into isolated layers:
 *   1. Full router.match() — baseline
 *   2. Static map lookup only
 *   3. JIT matchFn (regex.exec + param extraction + object creation)
 *   4. regex.exec() alone
 *   5. Overhead = (3) - (4): cost of param extraction + object alloc
 */

import type { Route } from "../src/router/base";
import { SonicRouter } from "../src/router/sonic-router";

const routes: Route<number>[] = [
	{ method: "GET", path: "/", data: 1 },
	{ method: "GET", path: "/about", data: 2 },
	{ method: "GET", path: "/api/health", data: 3 },
	{ method: "GET", path: "/api/config", data: 4 },
	{ method: "GET", path: "/login", data: 5 },
	{ method: "GET", path: "/register", data: 6 },
	{ method: "GET", path: "/dashboard", data: 7 },
	{ method: "GET", path: "/pricing", data: 8 },
	{ method: "GET", path: "/contact", data: 9 },
	{ method: "GET", path: "/terms", data: 10 },
	{ method: "GET", path: "/api/users/:id", data: 11 },
	{ method: "GET", path: "/api/posts/:slug", data: 12 },
	{ method: "GET", path: "/api/products/:sku", data: 13 },
	{ method: "GET", path: "/u/:username", data: 14 },
	{ method: "GET", path: "/c/:category", data: 15 },
	{ method: "GET", path: "/download/:fileId", data: 16 },
	{ method: "GET", path: "/docs/:page", data: 17 },
	{ method: "GET", path: "/events/:eventId", data: 18 },
	{ method: "GET", path: "/orgs/:orgId", data: 19 },
	{ method: "GET", path: "/settings/:section", data: 20 },
	{ method: "GET", path: "/api/posts/:id/comments/:commentId", data: 21 },
	{
		method: "GET",
		path: "/api/orgs/:orgId/teams/:teamId/members/:memberId",
		data: 22,
	},
	{ method: "GET", path: "/repo/:owner/:repo/issues/:issueId", data: 23 },
	{ method: "GET", path: "/store/:country/:state/:city", data: 24 },
	{ method: "GET", path: "/flights/:origin/:dest/:date", data: 25 },
	{ method: "GET", path: "/public/*path", data: 26 },
	{ method: "GET", path: "/assets/*path", data: 27 },
	{ method: "GET", path: "/images/*path", data: 28 },
	{ method: "GET", path: "/api/legacy/*path", data: 29 },
	{ method: "GET", path: "/proxy/*path", data: 30 },
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
console.log(
	`Request mix: ${requestMix.length} URLs\n`,
);

const ITERS = 1_000_000;

function bench(label: string, fn: () => void, calls: number): number {
	// warmup
	for (let i = 0; i < 2000; i++) fn();
	const start = performance.now();
	for (let i = 0; i < ITERS; i++) fn();
	const ms = performance.now() - start;
	const nsPerCall = ((ms / (ITERS * calls)) * 1e6).toFixed(0);
	console.log(
		`${label.padEnd(42)} ${ms.toFixed(1).padStart(8)}ms  (${nsPerCall}ns per URL)`,
	);
	return ms;
}

console.log("─".repeat(75));

// 1. Baseline: full match() over all URLs
const fullTime = bench(
	"Full router.match() — all URLs",
	() => {
		for (const u of requestMix) router.match("GET", u);
	},
	requestMix.length,
);

// 2. JIT matchFn alone
const jitTime = bench(
	"JIT matchFn() — all URLs",
	() => {
		for (const u of requestMix) matchFn(u, u, "GET");
	},
	requestMix.length,
);

console.log("─".repeat(75));
const routerOverhead = (((fullTime - jitTime) / fullTime) * 100).toFixed(1);
console.log(`\nBreakdown:`);
console.log(`  JIT fn time:           ${jitTime.toFixed(1)}ms`);
console.log(`  Router wrapper cost:   ${routerOverhead}% of full match time`);
