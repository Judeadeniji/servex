import { describe, expect, it } from "bun:test";
import { createServer } from "../src/index";

describe("Router", () => {
	const app = createServer();

	app.get("/users/:id", (c) => c.json({ id: c.params("id") }));
	app.post("/users", async (c) => {
		const body = await c.req.json();
		return c.json(body as any, 201);
	});
	app.get("/search", (c) => c.text(`q=${c.query("q")}`));

	// Test chi-style subrouting
	app.route("/api", (r) => {
		r.get("/health", (c) => c.text("OK"));
		r.route("/v1", (v1) => {
			v1.get("/status", (c) => c.text("v1 status"));
		});
	});

	it("should extract route parameters", async () => {
		const req = new Request("http://localhost/users/123");
		const res = await app.fetch(req);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ id: "123" });
	});

	it("should parse JSON body", async () => {
		const req = new Request("http://localhost/users", {
			method: "POST",
			body: JSON.stringify({ name: "John" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await app.fetch(req);
		expect(res.status).toBe(201);
		expect(await res.json()).toEqual({ name: "John" });
	});

	it("should extract query parameters", async () => {
		const req = new Request("http://localhost/search?q=bun");
		const res = await app.fetch(req);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("q=bun");
	});

	it("should return 405 Method Not Allowed", async () => {
		const req = new Request("http://localhost/users/123", { method: "DELETE" });
		const res = await app.fetch(req);
		expect(res.status).toBe(405);
	});

	it("should support chi-style sub-routing", async () => {
		const req1 = new Request("http://localhost/api/health");
		const res1 = await app.fetch(req1);
		expect(res1.status).toBe(200);
		expect(await res1.text()).toBe("OK");

		const req2 = new Request("http://localhost/api/v1/status");
		const res2 = await app.fetch(req2);
		expect(res2.status).toBe(200);
		expect(await res2.text()).toBe("v1 status");
	});

	it("should match multiple route parameters", async () => {
		app.get("/posts/:postId/comments/:commentId", (c) => {
			return c.json({ p: c.params("postId"), c: c.params("commentId") });
		});
		const req = new Request("http://localhost/posts/10/comments/20");
		const res = await app.fetch(req);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ p: "10", c: "20" });
	});

	it("should handle PUT, PATCH, and DELETE methods", async () => {
		app.put("/items/:id", (c) => c.text(`PUT ${c.params("id")}`));
		app.patch("/items/:id", (c) => c.text(`PATCH ${c.params("id")}`));
		app.delete("/items/:id", (c) => c.text(`DELETE ${c.params("id")}`));

		let res = await app.fetch(
			new Request("http://localhost/items/1", { method: "PUT" }),
		);
		expect(await res.text()).toBe("PUT 1");

		res = await app.fetch(
			new Request("http://localhost/items/2", { method: "PATCH" }),
		);
		expect(await res.text()).toBe("PATCH 2");

		res = await app.fetch(
			new Request("http://localhost/items/3", { method: "DELETE" }),
		);
		expect(await res.text()).toBe("DELETE 3");
	});

	it("should handle wildcard matching correctly", async () => {
		app.get("/files/*path", (c) => c.text(`File: ${c.params("path")}`));

		const res = await app.fetch(
			new Request("http://localhost/files/images/logo.png"),
		);
		expect(await res.text()).toBe("File: images/logo.png");
	});
});
