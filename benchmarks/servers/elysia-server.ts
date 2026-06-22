/**
 * Elysia server for comparison benchmarks.
 * Mirror of servex-server.ts — identical route set, same minimal handlers.
 * No validation, no schema, no body parsing.
 *
 * Run standalone:  bun benchmarks/servers/elysia-server.ts
 * Environment:
 *   PORT  — TCP port to listen on (default: 3001)
 */
import { Elysia } from "elysia";

const PORT = Number(process.env.PORT ?? 3001);

new Elysia()
	// ── Static routes (10) ────────────────────────────────────────────────
	.get("/", () => "ok")
	.get("/about", () => "ok")
	.get("/api/health", () => "ok")
	.get("/api/config", () => "ok")
	.get("/login", () => "ok")
	.get("/dashboard", () => "ok")
	.get("/pricing", () => "ok")
	.get("/contact", () => "ok")
	.get("/terms", () => "ok")
	.get("/docs", () => "ok")

	// ── Dynamic routes — single param (5) ────────────────────────────────
	.get("/api/users/:id", ({ params }) => params.id)
	.get("/api/posts/:id", ({ params }) => params.id)
	.get("/api/products/:sku", ({ params }) => params.sku)
	.get("/u/:username", ({ params }) => params.username)
	.get("/events/:eventId", ({ params }) => params.eventId)

	// ── Dynamic routes — multi-param (5) ─────────────────────────────────
	.get("/api/posts/:id/comments/:commentId", ({ params }) => params.id)
	.get("/repo/:owner/:repo", ({ params }) => params.owner)
	.get("/repo/:owner/:repo/issues/:issueId", ({ params }) => params.issueId)
	.get("/store/:country/:state", ({ params }) => params.country)
	.get("/flights/:origin/:dest/:date", ({ params }) => params.origin)

	// ── Wildcard routes (3) ───────────────────────────────────────────────
	.get("/public/*", () => "file")
	.get("/assets/*", () => "file")
	.get("/api/legacy/*", () => "legacy")

	.listen(PORT);

console.log(`[elysia] listening on :${PORT}`);
