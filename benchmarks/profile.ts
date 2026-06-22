import { Memoirist } from "memoirist";
import { SonicRouter } from "./src/router/sonic-router";

const sonic = new SonicRouter();
const routes = [
	{ method: "GET", path: "/", data: "ok" },
	{ method: "GET", path: "/api/health", data: "ok" },
	{ method: "GET", path: "/api/users/:id", data: "param" },
	{
		method: "GET",
		path: "/api/posts/:id/comments/:commentId",
		data: "param-n",
	},
	{ method: "GET", path: "/public/*path", data: "wild" },
];
for (const r of routes) sonic.addRoute(r);

const URLS = [
	"/",
	"/api/health",
	"/api/users/42",
	"/api/posts/99/comments/1",
	"/public/css/main.css",
	"/this/does/not/exist",
];

const ITERS = 10_000_000;
sonic.match("GET", "/"); // Compile
const matchFn = (sonic as any)._matchFns["GET"];

let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	for (let j = 0; j < URLS.length; j++) {
		matchFn(URLS[j], "GET");
	}
}
console.log(`Sonic JIT only: ${(performance.now() - start).toFixed(2)}ms`);

const getMatch = new Function(
	"url",
	`
    if (url === "/") return { matched: true };
    if (url === "/api/health") return { matched: true };
    if (url === "/api/users/42") return { matched: true };
    if (url === "/api/posts/99/comments/1") return { matched: true };
    if (url === "/public/css/main.css") return { matched: true };
    return null;
`,
);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	for (let j = 0; j < URLS.length; j++) {
		getMatch(URLS[j]);
	}
}
console.log(
	`Hardcoded string equality: ${(performance.now() - start).toFixed(2)}ms`,
);
