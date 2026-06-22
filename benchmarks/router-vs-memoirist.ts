import { Memoirist } from "memoirist";
import { SonicRouter } from "../src/router/sonic-router";

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
sonic.addRoute({ method: "GET", path: "/", data: "ok" });
sonic.addRoute({ method: "GET", path: "/about", data: "ok" });
sonic.addRoute({ method: "GET", path: "/api/health", data: "ok" });
sonic.addRoute({ method: "GET", path: "/api/config", data: "ok" });
sonic.addRoute({ method: "GET", path: "/login", data: "ok" });
sonic.addRoute({ method: "GET", path: "/dashboard", data: "ok" });
sonic.addRoute({ method: "GET", path: "/pricing", data: "ok" });
sonic.addRoute({ method: "GET", path: "/contact", data: "ok" });
sonic.addRoute({ method: "GET", path: "/terms", data: "ok" });
sonic.addRoute({ method: "GET", path: "/docs", data: "ok" });
sonic.addRoute({ method: "GET", path: "/api/users/:id", data: "param" });
sonic.addRoute({ method: "GET", path: "/api/posts/:id", data: "param" });
sonic.addRoute({ method: "GET", path: "/api/products/:sku", data: "param" });
sonic.addRoute({ method: "GET", path: "/u/:username", data: "param" });
sonic.addRoute({ method: "GET", path: "/events/:eventId", data: "param" });
sonic.addRoute({
	method: "GET",
	path: "/api/posts/:id/comments/:commentId",
	data: "param-n",
});
sonic.addRoute({ method: "GET", path: "/repo/:owner/:repo", data: "param-n" });
sonic.addRoute({
	method: "GET",
	path: "/repo/:owner/:repo/issues/:issueId",
	data: "param-n",
});
sonic.addRoute({
	method: "GET",
	path: "/store/:country/:state",
	data: "param-n",
});
sonic.addRoute({
	method: "GET",
	path: "/flights/:origin/:dest/:date",
	data: "param-n",
});
sonic.addRoute({ method: "GET", path: "/public/*path", data: "wild" });
sonic.addRoute({ method: "GET", path: "/assets/*path", data: "wild" });
sonic.addRoute({ method: "GET", path: "/api/legacy/*path", data: "wild" });

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

const ITERS = 1_000_000;

// Warmup
for (let i = 0; i < 1000; i++) {
	for (const url of URLS) {
		memoirist.find("GET", url);
		sonic.match("GET", url);
	}
}

// Benchmark
let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	for (const url of URLS) {
		memoirist.find("GET", url);
	}
}
const memTime = performance.now() - start;
console.log(`Memoirist:            ${memTime.toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	for (const url of URLS) {
		sonic.match("GET", url);
	}
}
const sonicTime = performance.now() - start;
console.log(`SonicRouter (Trie):   ${sonicTime.toFixed(2)}ms`);

console.log(
	`\nSonic (Trie) is ${(memTime / sonicTime).toFixed(2)}x ${sonicTime < memTime ? "faster" : "slower"} than Memoirist`,
);
