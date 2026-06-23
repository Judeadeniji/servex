import * as fs from "node:fs";
import { Memoirist } from "memoirist";

const memoirist = new Memoirist();
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
memoirist.add("GET", "/api/users/:id", "param");
memoirist.add("GET", "/api/posts/:id", "param");
memoirist.add("GET", "/api/products/:sku", "param");
memoirist.add("GET", "/u/:username", "param");
memoirist.add("GET", "/events/:eventId", "param");
memoirist.add("GET", "/api/posts/:id/comments/:commentId", "param-n");
memoirist.add("GET", "/repo/:owner/:repo", "param-n");
memoirist.add("GET", "/repo/:owner/:repo/issues/:issueId", "param-n");
memoirist.add("GET", "/store/:country/:state", "param-n");
memoirist.add("GET", "/flights/:origin/:dest/:date", "param-n");
memoirist.add("GET", "/public/*", "wild");
memoirist.add("GET", "/assets/*", "wild");
memoirist.add("GET", "/api/legacy/*", "wild");

console.log((memoirist as unknown as { compile: () => string }).compile());
fs.writeFileSync(
	"memoirist-code.js",
	(memoirist as unknown as { compile: () => string }).compile(),
);
