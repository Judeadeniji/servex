import * as fs from "fs";
import { SonicRouter } from "../../src/router/sonic-router";

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
sonic.addRoute({
	method: "GET",
	path: "/api/products/:sku",
	handlers: ["param"],
});
sonic.addRoute({ method: "GET", path: "/u/:username", handlers: ["param"] });
sonic.addRoute({
	method: "GET",
	path: "/events/:eventId",
	handlers: ["param"],
});
sonic.addRoute({
	method: "GET",
	path: "/api/posts/:id/comments/:commentId",
	handlers: ["param-n"],
});
sonic.addRoute({
	method: "GET",
	path: "/repo/:owner/:repo",
	handlers: ["param-n"],
});
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
sonic.addRoute({
	method: "GET",
	path: "/api/legacy/*path",
	handlers: ["wild"],
});

(sonic as any).compile("GET");

const matcher = sonic._matchFns.GET;
fs.writeFileSync("generated-code.js", matcher.toString());
