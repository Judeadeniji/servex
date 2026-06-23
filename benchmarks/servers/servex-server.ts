/**
 * ServeX server for comparison benchmarks.
 * Uses SonicRouter (JIT) — the fastest router configuration.
 * No validation, no body parsing, minimal handlers.
 *
 * Run standalone:  bun benchmarks/servers/servex-server.ts
 * Environment:
 *   PORT  — TCP port to listen on (default: 3000)
 */
import { createServer } from "../../src/index";
import { RouterType } from "../../src/router/adapter";

const PORT = Number(process.env.PORT ?? 3000);

const app = createServer({
	router: RouterType.SONIC,
	nativeStaticResponse: true,
});

// ── Static routes (10) ─────────────────────────────────────────────────────
app.get("/", () => new Response("ok"));
app.get("/about", () => new Response("ok"));
app.get("/api/health", () => new Response("ok"));
app.get("/api/config", () => new Response("ok"));
app.get("/login", () => new Response("ok"));
app.get("/dashboard", () => new Response("ok"));
app.get("/pricing", () => new Response("ok"));
app.get("/contact", () => new Response("ok"));
app.get("/terms", () => new Response("ok"));
app.get("/docs", () => new Response("ok"));

// ── Dynamic routes — single param (5) ─────────────────────────────────────
app.get("/api/users/:id", (ctx) => new Response(ctx.params("id")));
app.get("/api/posts/:id", (ctx) => new Response(ctx.params("id")));
app.get("/api/products/:sku", (ctx) => new Response(ctx.params("sku")));
app.get("/u/:username", (ctx) => new Response(ctx.params("username")));
app.get("/events/:eventId", (ctx) => new Response(ctx.params("eventId")));

// ── Dynamic routes — multi-param (5) ──────────────────────────────────────
app.get(
	"/api/posts/:id/comments/:commentId",
	(ctx) => new Response(ctx.params("id")),
);
app.get("/repo/:owner/:repo", (ctx) => new Response(ctx.params("owner")));
app.get(
	"/repo/:owner/:repo/issues/:issueId",
	(ctx) => new Response(ctx.params("issueId")),
);
app.get("/store/:country/:state", (ctx) => new Response(ctx.params("country")));
app.get(
	"/flights/:origin/:dest/:date",
	(ctx) => new Response(ctx.params("origin")),
);

// ── Wildcard routes (3) ────────────────────────────────────────────────────
app.get("/public/*path", (_ctx) => new Response("file"));
app.get("/assets/*path", (_ctx) => new Response("file"));
app.get("/api/legacy/*path", (_ctx) => new Response("legacy"));

Bun.serve({ port: PORT, fetch: app.fetch, static: app.static });
console.log(`[servex] listening on :${PORT}`);
