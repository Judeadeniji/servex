import { describe, expect, it } from "bun:test";
import { createServer, normalisePath } from "../src/index";

// ─── Unit: normalisePath ──────────────────────────────────────────────────────

describe("normalisePath()", () => {
	it("returns '/' for empty string", () => {
		expect(normalisePath("")).toBe("/");
	});

	it("returns '/' for '/'", () => {
		expect(normalisePath("/")).toBe("/");
	});

	it("adds leading slash when missing", () => {
		expect(normalisePath("api")).toBe("/api");
		expect(normalisePath("api/v1")).toBe("/api/v1");
	});

	it("strips trailing slash", () => {
		expect(normalisePath("/api/")).toBe("/api");
		expect(normalisePath("/api/v1/")).toBe("/api/v1");
	});

	it("preserves interior slashes", () => {
		expect(normalisePath("/api/v1")).toBe("/api/v1");
	});

	it("handles leading + trailing slash together", () => {
		expect(normalisePath("/api/")).toBe("/api");
	});
});

// ─── Integration: basic base path routing ─────────────────────────────────────

describe("basePath — basic routing", () => {
	it("matches routes under the base path", async () => {
		const app = createServer({ basePath: "/api/v1" });
		app.get("/users", (c) => c.text("users list"));

		const res = await app.fetch(new Request("http://localhost/api/v1/users"));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("users list");
	});

	it("returns 404 for requests that don't match the base path", async () => {
		const app = createServer({ basePath: "/api/v1" });
		app.get("/users", (c) => c.text("users list"));

		const res = await app.fetch(new Request("http://localhost/other/users"));
		expect(res.status).toBe(404);
	});

	it("returns 404 for the exact base prefix without trailing route", async () => {
		const app = createServer({ basePath: "/api" });
		app.get("/users", (c) => c.text("users list"));

		// /api itself has no route registered — should 404
		const res = await app.fetch(new Request("http://localhost/api"));
		expect(res.status).toBe(404);
	});

	it("serves the root route '/' when basePath + '/' is requested", async () => {
		const app = createServer({ basePath: "/v1" });
		app.get("/", (c) => c.text("root"));

		const res = await app.fetch(new Request("http://localhost/v1/"));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("root");
	});

	it("exposes basePath on the app instance", () => {
		const app = createServer({ basePath: "/api/v2" });
		expect(app.basePath).toBe("/api/v2");
	});

	it("defaults basePath to '/' when not provided", () => {
		const app = createServer();
		expect(app.basePath).toBe("/");
	});
});

// ─── Integration: normalisation of basePath option ────────────────────────────

describe("basePath — option normalisation", () => {
	it("accepts a trailing slash in the option and normalises it", async () => {
		const app = createServer({ basePath: "/api/" });
		expect(app.basePath).toBe("/api");

		app.get("/ping", (c) => c.text("pong"));
		const res = await app.fetch(new Request("http://localhost/api/ping"));
		expect(res.status).toBe(200);
	});

	it("accepts a path without leading slash", async () => {
		const app = createServer({ basePath: "api" });
		expect(app.basePath).toBe("/api");

		app.get("/ping", (c) => c.text("pong"));
		const res = await app.fetch(new Request("http://localhost/api/ping"));
		expect(res.status).toBe(200);
	});
});

// ─── Integration: route params & query strings ────────────────────────────────

describe("basePath — route params and query strings", () => {
	it("extracts route params correctly under a base path", async () => {
		const app = createServer({ basePath: "/api" });
		app.get("/items/:id", (c) => c.json({ id: c.params("id") }));

		const res = await app.fetch(new Request("http://localhost/api/items/42"));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: "42" });
	});

	it("preserves query strings under a base path", async () => {
		const app = createServer({ basePath: "/api" });
		app.get("/search", (c) => c.json({ q: c.query("q") }));

		const res = await app.fetch(
			new Request("http://localhost/api/search?q=hello"),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ q: "hello" });
	});
});

// ─── Integration: without base path (root app unaffected) ─────────────────────

describe("basePath — root app (no basePath) is unaffected", () => {
	it("routes normally when no basePath is set", async () => {
		const app = createServer();
		app.get("/health", (c) => c.text("ok"));

		const res = await app.fetch(new Request("http://localhost/health"));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
	});
});

// ─── Integration: basePath + hooks ────────────────────────────────────────────

describe("basePath — interaction with lifecycle hooks", () => {
	it("onRequest hook fires for requests under the base path", async () => {
		const app = createServer({ basePath: "/app" });
		let hookFired = false;

		app.onRequest(() => {
			hookFired = true;
		});
		app.get("/ping", (c) => c.text("pong"));

		await app.fetch(new Request("http://localhost/app/ping"));
		expect(hookFired).toBe(true);
	});

	it("onRequest hook does NOT fire for requests outside the base path", async () => {
		const app = createServer({ basePath: "/app" });
		let hookFired = false;

		app.onRequest(() => {
			hookFired = true;
		});
		app.get("/ping", (c) => c.text("pong"));

		// This 404s before hooks even run (base path mismatch)
		await app.fetch(new Request("http://localhost/other/ping"));
		expect(hookFired).toBe(false);
	});
});

// ─── Integration: basePath + subrouters ───────────────────────────────────────

describe("basePath — interaction with route()", () => {
	it("combines basePath with route() sub-prefixes", async () => {
		const app = createServer({ basePath: "/api" });

		app.route("/v1", (r) => {
			r.get("/users", (c) => c.text("v1 users"));
		});

		const res = await app.fetch(new Request("http://localhost/api/v1/users"));
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("v1 users");
	});

	it("does not match route() paths without base prefix", async () => {
		const app = createServer({ basePath: "/api" });
		app.route("/v1", (r) => {
			r.get("/users", (c) => c.text("v1 users"));
		});

		const res = await app.fetch(new Request("http://localhost/v1/users"));
		expect(res.status).toBe(404);
	});
});
