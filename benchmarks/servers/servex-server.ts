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
})

	// ── Static routes (10) ─────────────────────────────────────────────────────
	.get("/", "Ok")
	.get("/about", "Ok")
	.get("/api/health", "Ok")
	.get("/api/config", "Ok")
	.get("/login", "Ok")
	.get("/dashboard", "Ok")
	.get("/pricing", "Ok")
	.get("/contact", "Ok")
	.get("/terms", "Ok")
	.get("/docs", "Ok")

	// ── Dynamic routes — single param (5) ─────────────────────────────────────
	.get("/api/users/:id", (ctx) => new Response(ctx.params("id")))
	.get("/api/posts/:id", (ctx) => new Response(ctx.params("id")))
	.get("/api/products/:sku", (ctx) => new Response(ctx.params("sku")))
	.get("/u/:username", (ctx) => new Response(ctx.params("username")))
	.get("/events/:eventId", (ctx) => new Response(ctx.params("eventId")))

	// ── Dynamic routes — multi-param (5) ──────────────────────────────────────
	.get(
		"/api/posts/:id/comments/:commentId",
		(ctx) => new Response(ctx.params("id")),
	)
	.get("/repo/:owner/:repo", (ctx) => new Response(ctx.params("owner")))
	.get(
		"/repo/:owner/:repo/issues/:issueId",
		(ctx) => new Response(ctx.params("issueId")),
	)
	.get("/store/:country/:state", (ctx) => new Response(ctx.params("country")))
	.get(
		"/flights/:origin/:dest/:date",
		(ctx) => new Response(ctx.params("origin")),
	)

	// ── Wildcard routes (3) ────────────────────────────────────────────────────
	.get("/public/*path", (_ctx) => new Response("file"))
	.get("/assets/*path", (_ctx) => new Response("file"))
	.get("/api/legacy/*path", (_ctx) => new Response("legacy"));

Bun.serve({ port: PORT, fetch: app.fetch, static: app.static });
console.log(`[servex] listening on :${PORT}`);
