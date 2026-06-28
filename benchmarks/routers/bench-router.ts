import { bench, run } from "mitata";
import { RouterAdapter, RouterType } from "../../src/router/adapter";
import type { Route } from "../../src/router/base";
import type { Context } from "../../src/context";

// Create dummy routes (realistic mix)
const routes: Route[] = [
	// 10 Static routes
	{ method: "GET", path: "/", handlers: [() => new Response("Root")] },
	{ method: "GET", path: "/about", handlers: [() => new Response("About")] },
	{ method: "GET", path: "/api/health", handlers: [() => new Response("OK")] },
	{
		method: "GET",
		path: "/api/config",
		handlers: [() => new Response("Config")],
	},
	{ method: "GET", path: "/login", handlers: [() => new Response("Login")] },
	{
		method: "GET",
		path: "/register",
		handlers: [() => new Response("Register")],
	},
	{
		method: "GET",
		path: "/dashboard",
		handlers: [() => new Response("Dashboard")],
	},
	{
		method: "GET",
		path: "/pricing",
		handlers: [() => new Response("Pricing")],
	},
	{
		method: "GET",
		path: "/contact",
		handlers: [() => new Response("Contact")],
	},
	{ method: "GET", path: "/terms", handlers: [() => new Response("Terms")] },

	// 10 Simple Param routes
	{
		method: "GET",
		path: "/api/users/:id",
		handlers: [() => new Response("User")],
	},
	{
		method: "GET",
		path: "/api/posts/:slug",
		handlers: [() => new Response("Post")],
	},
	{
		method: "GET",
		path: "/api/products/:sku",
		handlers: [() => new Response("Product")],
	},
	{
		method: "GET",
		path: "/u/:username",
		handlers: [() => new Response("Profile")],
	},
	{
		method: "GET",
		path: "/c/:category",
		handlers: [() => new Response("Category")],
	},
	{
		method: "GET",
		path: "/download/:fileId",
		handlers: [() => new Response("Download")],
	},
	{
		method: "GET",
		path: "/docs/:page",
		handlers: [() => new Response("Docs")],
	},
	{
		method: "GET",
		path: "/events/:eventId",
		handlers: [() => new Response("Event")],
	},
	{
		method: "GET",
		path: "/orgs/:orgId",
		handlers: [() => new Response("Org")],
	},
	{
		method: "GET",
		path: "/settings/:section",
		handlers: [() => new Response("Settings")],
	},

	// 5 Deep/Multi Param routes
	{
		method: "GET",
		path: "/api/posts/:id/comments/:commentId",
		handlers: [() => new Response("Comment")],
	},
	{
		method: "GET",
		path: "/api/orgs/:orgId/teams/:teamId/members/:memberId",
		handlers: [() => new Response("Member")],
	},
	{
		method: "GET",
		path: "/repo/:owner/:repo/issues/:issueId",
		handlers: [() => new Response("Issue")],
	},
	{
		method: "GET",
		path: "/store/:country/:state/:city",
		handlers: [() => new Response("Store")],
	},
	{
		method: "GET",
		path: "/flights/:origin/:dest/:date",
		handlers: [() => new Response("Flight")],
	},

	// 5 Wildcard routes
	{
		method: "GET",
		path: "/public/*path",
		handlers: [() => new Response("Static")],
	},
	{
		method: "GET",
		path: "/assets/*path",
		handlers: [() => new Response("Assets")],
	},
	{
		method: "GET",
		path: "/images/*path",
		handlers: [() => new Response("Images")],
	},
	{
		method: "GET",
		path: "/api/legacy/*path",
		handlers: [() => new Response("Legacy")],
	},
	{
		method: "GET",
		path: "/proxy/*path",
		handlers: [() => new Response("Proxy")],
	},
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
