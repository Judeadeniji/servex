import { describe, expect, it } from "bun:test";
import { createServer } from "../../../src";
import { rateLimiter } from "./index";

describe("Middleware: Rate Limiter", () => {
	it("should allow requests below the limit", async () => {
		const app = createServer();
		app.use(rateLimiter({ limit: 2, window: 1 }));
		app.get("/", (c) => c.text("OK"));

		const req = new Request("http://localhost/");

		let res = await app.fetch(req);
		expect(res.status).toBe(200);
		expect(res.headers.get("X-RateLimit-Limit")).toBe("2");
		expect(res.headers.get("X-RateLimit-Remaining")).toBe("1");

		res = await app.fetch(req);
		expect(res.status).toBe(200);
		expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
	});

	it("should block requests exceeding the limit", async () => {
		const app = createServer();
		app.use(rateLimiter({ limit: 1, window: 1 }));
		app.get("/", (c) => c.text("OK"));

		const req = new Request("http://localhost/");

		// First request should pass
		await app.fetch(req);

		// Second request should fail
		const res = await app.fetch(req);
		expect(res.status).toBe(429);
		expect(await res.text()).toBe("Too Many Requests");
		expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
		expect(res.headers.has("Retry-After")).toBe(true);
	});

	it("should use a custom key generator to separate limits", async () => {
		const app = createServer();
		app.use(
			rateLimiter({
				limit: 1,
				window: 1,
				keyGenerator: (c) => c.req.headers.get("x-user-id") || "anonymous",
			}),
		);
		app.get("/", (c) => c.text("OK"));

		const reqUser1 = new Request("http://localhost/", {
			headers: { "x-user-id": "user1" },
		});
		const reqUser2 = new Request("http://localhost/", {
			headers: { "x-user-id": "user2" },
		});

		// User 1 hits limit
		let res1 = await app.fetch(reqUser1);
		expect(res1.status).toBe(200);
		res1 = await app.fetch(reqUser1);
		expect(res1.status).toBe(429);

		// User 2 should still be allowed
		const res2 = await app.fetch(reqUser2);
		expect(res2.status).toBe(200);
	});

	it("should support a custom error message", async () => {
		const app = createServer();
		app.use(
			rateLimiter({
				limit: 1,
				window: 1,
				message: "Custom Error",
			}),
		);
		app.get("/", (c) => c.text("OK"));

		const req = new Request("http://localhost/");
		await app.fetch(req);
		const res = await app.fetch(req);
		expect(res.status).toBe(429);
		expect(await res.text()).toBe("Custom Error");
	});

	it("should support a custom Response function for rate limit exceeded", async () => {
		const app = createServer();
		app.use(
			rateLimiter({
				limit: 1,
				window: 1,
				message: (c) => c.json({ error: "Throttled" }, 429),
			}),
		);
		app.get("/", (c) => c.text("OK"));

		const req = new Request("http://localhost/");
		await app.fetch(req);
		const res = await app.fetch(req);
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({ error: "Throttled" });
	});
});
