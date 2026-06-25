import { Memoirist } from "memoirist";
import { bench, run } from "mitata";
import { SonicRouter } from "../../src/router/sonic-router";

// 1. Setup Memoirist
const memoirist = new Memoirist();
// Static
memoirist.add("GET", "/", "ok");
memoirist.add("GET", "/about", "ok");
memoirist.add("GET", "/api/health", "ok");
memoirist.add("GET", "/api/config", "ok");
memoirist.add("GET", "/login", "ok");
memoirist.add("GET", "/dashboard", "ok");
memoirist.add("GET", "/pricing", "ok");
memoirist.add("GET", "/contact", "ok");
memoirist.add("GET", "/terms", "ok");
memoirist.add("GET", "/docs", "ok");
// Single param
memoirist.add("GET", "/api/users/:id", "param");
memoirist.add("GET", "/api/posts/:id", "param"); // changed to id to match constraint
memoirist.add("GET", "/api/products/:sku", "param");
memoirist.add("GET", "/u/:username", "param");
memoirist.add("GET", "/events/:eventId", "param");
// Multi-param
memoirist.add("GET", "/api/posts/:id/comments/:commentId", "param-n");
memoirist.add("GET", "/repo/:owner/:repo", "param-n");
memoirist.add("GET", "/repo/:owner/:repo/issues/:issueId", "param-n");
memoirist.add("GET", "/store/:country/:state", "param-n");
memoirist.add("GET", "/flights/:origin/:dest/:date", "param-n");
// Wildcard
memoirist.add("GET", "/public/*", "wild");
memoirist.add("GET", "/assets/*", "wild");
memoirist.add("GET", "/api/legacy/*", "wild");

// 2. Setup SonicRouter
const sonic = new SonicRouter();
sonic.addRoute({ method: "GET", path: "/", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/about", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/api/health", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/api/config", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/login", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/dashboard", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/pricing", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/contact", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/terms", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/docs", handlers: ["ok"] });
sonic.addRoute({ method: "GET", path: "/api/users/:id", handlers: ["param"] });
sonic.addRoute({ method: "GET", path: "/api/posts/:id", handlers: ["param"] });
sonic.addRoute({ method: "GET", path: "/api/products/:sku", handlers: ["param"] });
sonic.addRoute({ method: "GET", path: "/u/:username", handlers: ["param"] });
sonic.addRoute({ method: "GET", path: "/events/:eventId", handlers: ["param"] });
sonic.addRoute({
	method: "GET",
	path: "/api/posts/:id/comments/:commentId",
	handlers: ["param-n"],
});
sonic.addRoute({ method: "GET", path: "/repo/:owner/:repo", handlers: ["param-n"] });
sonic.addRoute({
	method: "GET",
	path: "/repo/:owner/:repo/issues/:issueId",
	handlers: ["param-n"],
});
sonic.addRoute({
	method: "GET",
	path: "/store/:country/:state",
	handlers: ["param-n"],
});
sonic.addRoute({
	method: "GET",
	path: "/flights/:origin/:dest/:date",
	handlers: ["param-n"],
});
sonic.addRoute({ method: "GET", path: "/public/*path", handlers: ["wild"] });
sonic.addRoute({ method: "GET", path: "/assets/*path", handlers: ["wild"] });
sonic.addRoute({ method: "GET", path: "/api/legacy/*path", handlers: ["wild"] });

// The requests
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

bench("Memoirist", () => {
	for (const url of URLS) {
		memoirist.find("GET", url);
	}
});

bench("SonicRouter (Trie)", () => {
	for (const url of URLS) {
		sonic.match("GET", url);
	}
});

await run();
