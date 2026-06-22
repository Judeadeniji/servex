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
sonic.match("GET", "/");
const matchFn = (sonic as any)._matchFns["GET"];
console.log(matchFn.toString());
