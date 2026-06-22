import { SonicRouter } from "../../src/router/sonic-router";

const sonic = new SonicRouter();
const routes = [
	{ method: "GET", path: "/", data: "ok" },
	{ method: "GET", path: "/about", data: "ok" },
	{ method: "GET", path: "/api/health", data: "ok" },
	{ method: "GET", path: "/api/config", data: "ok" },
	{ method: "GET", path: "/login", data: "ok" },
	{ method: "GET", path: "/dashboard", data: "ok" },
	{ method: "GET", path: "/pricing", data: "ok" },
	{ method: "GET", path: "/contact", data: "ok" },
	{ method: "GET", path: "/terms", data: "ok" },
	{ method: "GET", path: "/docs", data: "ok" },
	{ method: "GET", path: "/api/users/:id", data: "param" },
	{ method: "GET", path: "/api/posts/:id", data: "param" },
	{ method: "GET", path: "/api/products/:sku", data: "param" },
	{ method: "GET", path: "/u/:username", data: "param" },
	{ method: "GET", path: "/events/:eventId", data: "param" },
	{
		method: "GET",
		path: "/api/posts/:id/comments/:commentId",
		data: "param-n",
	},
	{ method: "GET", path: "/repo/:owner/:repo", data: "param-n" },
	{
		method: "GET",
		path: "/repo/:owner/:repo/issues/:issueId",
		data: "param-n",
	},
	{ method: "GET", path: "/store/:country/:state", data: "param-n" },
	{ method: "GET", path: "/flights/:origin/:dest/:date", data: "param-n" },
	{ method: "GET", path: "/public/*path", data: "wild" },
	{ method: "GET", path: "/assets/*path", data: "wild" },
	{ method: "GET", path: "/api/legacy/*path", data: "wild" },
] as any[];

for (const r of routes) sonic.addRoute(r);

const URLS = [
	"/",
	"/api/health",
	"/dashboard",
	"/docs",
	"/contact",
	"/api/users/42",
	"/api/posts/hello-world",
	"/u/johndoe",
	"/events/evt-2026-06",
	"/api/products/SKU-999",
	"/api/posts/99/comments/1",
	"/repo/microsoft/vscode",
	"/flights/JFK/LAX/2026-12-01",
	"/public/css/main.css",
	"/this/does/not/exist",
];

for (let i = 0; i < 1000; i++) {
	for (const url of URLS) sonic.match("GET", url);
}

const ITERS = 1_000_000;
const start = performance.now();
for (let i = 0; i < ITERS; i++) {
	for (const url of URLS) sonic.match("GET", url);
}
const time = performance.now() - start;
console.log(
	`SonicRouter: ${time.toFixed(2)}ms for ${ITERS * URLS.length} lookups`,
);
