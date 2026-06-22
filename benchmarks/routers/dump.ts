import * as fs from "node:fs";
import { SonicRouter } from "../../src/router/sonic-router";

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

(sonic as any).compile("GET");

const matcher = (sonic as any).matchFns.GET;
fs.writeFileSync("generated-code.js", matcher.toString());
