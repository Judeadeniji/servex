import { bench, run } from "mitata";
import { RouterAdapter, RouterType } from "../../src/router/adapter";
import type { Route } from "../../src/router/base";
import type { Context } from "../../src/context";

// Create dummy routes (realistic mix)
const routes: Route<import("../../src/types").Handler<Context>[]>[] = [
	// 10 Static routes
	{ method: "GET", path: "/", data: [() => new Response("Root")] },
	{ method: "GET", path: "/about", data: [() => new Response("About")] },
	{ method: "GET", path: "/api/health", data: [() => new Response("OK")] },
	{ method: "GET", path: "/api/config", data: [() => new Response("Config")] },
	{ method: "GET", path: "/login", data: [() => new Response("Login")] },
	{ method: "GET", path: "/register", data: [() => new Response("Register")] },
	{
		method: "GET",
		path: "/dashboard",
		data: [() => new Response("Dashboard")],
	},
	{ method: "GET", path: "/pricing", data: [() => new Response("Pricing")] },
	{ method: "GET", path: "/contact", data: [() => new Response("Contact")] },
	{ method: "GET", path: "/terms", data: [() => new Response("Terms")] },

	// 10 Simple Param routes
	{ method: "GET", path: "/api/users/:id", data: [() => new Response("User")] },
	{
		method: "GET",
		path: "/api/posts/:slug",
		data: [() => new Response("Post")],
	},
	{
		method: "GET",
		path: "/api/products/:sku",
		data: [() => new Response("Product")],
	},
	{
		method: "GET",
		path: "/u/:username",
		data: [() => new Response("Profile")],
	},
	{
		method: "GET",
		path: "/c/:category",
		data: [() => new Response("Category")],
	},
	{
		method: "GET",
		path: "/download/:fileId",
		data: [() => new Response("Download")],
	},
	{ method: "GET", path: "/docs/:page", data: [() => new Response("Docs")] },
	{
		method: "GET",
		path: "/events/:eventId",
		data: [() => new Response("Event")],
	},
	{ method: "GET", path: "/orgs/:orgId", data: [() => new Response("Org")] },
	{
		method: "GET",
		path: "/settings/:section",
		data: [() => new Response("Settings")],
	},

	// 5 Deep/Multi Param routes
	{
		method: "GET",
		path: "/api/posts/:id/comments/:commentId",
		data: [() => new Response("Comment")],
	},
	{
		method: "GET",
		path: "/api/orgs/:orgId/teams/:teamId/members/:memberId",
		data: [() => new Response("Member")],
	},
	{
		method: "GET",
		path: "/repo/:owner/:repo/issues/:issueId",
		data: [() => new Response("Issue")],
	},
	{
		method: "GET",
		path: "/store/:country/:state/:city",
		data: [() => new Response("Store")],
	},
	{
		method: "GET",
		path: "/flights/:origin/:dest/:date",
		data: [() => new Response("Flight")],
	},

	// 5 Wildcard routes
	{
		method: "GET",
		path: "/public/*path",
		data: [() => new Response("Static")],
	},
	{
		method: "GET",
		path: "/assets/*path",
		data: [() => new Response("Assets")],
	},
	{
		method: "GET",
		path: "/images/*path",
		data: [() => new Response("Images")],
	},
	{
		method: "GET",
		path: "/api/legacy/*path",
		data: [() => new Response("Legacy")],
	},
	{ method: "GET", path: "/proxy/*path", data: [() => new Response("Proxy")] },
];

const requestMix = [
	"/", // Root static
	"/api/health", // Deep static
	"/api/users/999", // Simple param
	"/repo/microsoft/typescript/issues/1234", // Deep multi param
	"/public/css/main.css", // Wildcard
	"/flights/JFK/LAX/2026-10-31", // Multi param
	"/contact", // Static
	"/assets/js/app.bundle.js", // Wildcard
	"/api/not-found", // 404
	"/repo/owner-only/no-repo", // 404 partial match
];

const radixRouter = new RouterAdapter({ type: RouterType.RADIX, routes });
const trieRouter = new RouterAdapter({ type: RouterType.TRIE, routes });
const sonicRouter = new RouterAdapter({ type: RouterType.SONIC, routes });

bench("RADIX Router", () => {
	for (const req of requestMix) {
		radixRouter.match("GET", req);
	}
});

bench("TRIE Router", () => {
	for (const req of requestMix) {
		trieRouter.match("GET", req);
	}
});

bench("SONIC Router", () => {
	for (const req of requestMix) {
		sonicRouter.match("GET", req);
	}
});

await run();
