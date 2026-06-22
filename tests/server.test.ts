import { describe, expect, it } from "bun:test";
import { createServer } from "../src/index";

describe("Server basic functionality", () => {
	it("should return 200 and 'Hello World'", async () => {
		const app = createServer();
		app.get("/", (c) => c.text("Hello World"));

		const req = new Request("http://localhost/");
		const res = await app.fetch(req);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("Hello World");
	});

	it("should return 404 for unknown route", async () => {
		const app = createServer();
		app.get("/", (c) => c.text("Hello World"));

		const req = new Request("http://localhost/not-found");
		const res = await app.fetch(req);

		expect(res.status).toBe(404);
	});
});
