import { describe, expect, test } from "bun:test";
import { createServer } from "../app";
import { createClient } from "./index";

describe("RPC Client", () => {
	const app = createServer()
		.get("/ping", (c) => c.text("pong"))
		.post("/echo", async (c) => {
			const body = await c.req.json().catch(() => null);
			return c.json({ echo: body });
		})
		.get("/users/:id", (c) => {
			const id = c.params("id");
			const search = c.query("search");
			return c.json({ id, search: search || null });
		})
		.get("/arrays", (c) => {
			const filter = c.queries("filter");
			return c.json({ filter });
		});

	type AppType = typeof app;

	// Use our newly added custom fetch option to bypass the network entirely
	const client = createClient<AppType>("http://localhost", {
		fetch: app.fetch,
	});

	test("Basic GET request", async () => {
		const res = await client.ping.get();
		// Since it returns text, the client should automatically parse it as text
		expect(res).toBe("pong");
	});

	test("POST request with body", async () => {
		const payload = { hello: "world" };
		const res = await client.echo.post({ body: payload });
		expect(res).toEqual({ echo: payload });
	});

	test("GET request with path params and query", async () => {
		const res = await client.users[":id"].get({
			params: { id: "123" },
			query: { search: "test" },
		});
		expect(res).toEqual({ id: "123", search: "test" });
	});

	test("GET request with array query parameters", async () => {
		const res = await client.arrays.get({
			query: { filter: ["a", "b"] },
		});
		expect(res).toEqual({ filter: ["a", "b"] });
	});

	test("Throw on HTTP errors", async () => {
		// @ts-expect-error - testing invalid path
		expect(client["does-not-exist"].get()).rejects.toThrow(
			"ServeX RPC Error: HTTP 404",
		);
	});
});
