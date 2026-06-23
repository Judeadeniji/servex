import { describe, expect, it } from "bun:test";
import { createServer } from "../src/index";

describe("Lifecycle Hooks", () => {
	it("should execute onRequest hook and allow short-circuiting", async () => {
		const app = createServer();
		app.onRequest((c) => {
			if (c.req.url.includes("banned")) {
				return c.text("Banned", 403);
			}
		});

		app.get("/", (c) => c.text("Hello"));

		const req1 = new Request("http://localhost/");
		const res1 = await app.fetch(req1);
		expect(res1.status).toBe(200);

		const req2 = new Request("http://localhost/banned");
		const res2 = await app.fetch(req2);
		expect(res2.status).toBe(403);
		expect(await res2.text()).toBe("Banned");
	});

	it("should execute onBeforeHandle hook with parsed params", async () => {
		const app = createServer();

		app.onBeforeHandle((c) => {
			if (c.params("id") === "999") {
				return c.text("Invalid ID", 400);
			}
		});

		app.get("/users/:id", (c) => c.text(`User ${c.params("id")}`));

		const res1 = await app.fetch(new Request("http://localhost/users/1"));
		expect(await res1.text()).toBe("User 1");

		const res2 = await app.fetch(new Request("http://localhost/users/999"));
		expect(res2.status).toBe(400);
		expect(await res2.text()).toBe("Invalid ID");
	});

	it("should execute onAfterHandle hook and allow mutating response", async () => {
		const app = createServer();

		app.onAfterHandle((c, res) => {
			res.headers.set("X-Custom-Hook", "Passed");
			if (res.status === 404) {
				return c.text("Custom Not Found", 404);
			}
		});

		app.get("/", (c) => c.text("Hello"));

		const res1 = await app.fetch(new Request("http://localhost/"));
		expect(res1.headers.get("X-Custom-Hook")).toBe("Passed");

		const res2 = await app.fetch(new Request("http://localhost/notfound"));
		expect(await res2.text()).toBe("Custom Not Found");
	});

	it("should execute onError hook and handle thrown errors", async () => {
		const app = createServer();

		app.onError((err, c) => {
			return c.json({ error: err.message }, 500);
		});

		app.get("/crash", () => {
			throw new Error("Deliberate Crash");
		});

		const res = await app.fetch(new Request("http://localhost/crash"));
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "Deliberate Crash" });
	});

	it("should execute onResponse hook after everything", async () => {
		const app = createServer();
		let responseCalled = false;

		app.onResponse(() => {
			responseCalled = true;
		});

		app.get("/", (c) => c.text("OK"));

		await app.fetch(new Request("http://localhost/"));
		expect(responseCalled).toBe(true);
	});
});
