import { describe, expect, test } from "bun:test";
import { buildClientUrl, buildRequestInit, parseClientResponse } from "./utils";

describe("Client Utilities", () => {
	describe("buildClientUrl", () => {
		test("builds simple URL correctly", () => {
			const url = buildClientUrl("http://localhost", ["api", "test"]);
			expect(url.toString()).toBe("http://localhost/api/test");
		});

		test("substitutes path parameters", () => {
			const url = buildClientUrl("http://localhost", ["users", ":id"], {
				params: { id: "123" },
			});
			expect(url.toString()).toBe("http://localhost/users/123");
		});

		test("appends query parameters", () => {
			const url = buildClientUrl("http://localhost", ["search"], {
				query: { q: "test", page: 1 },
			});
			expect(url.toString()).toBe("http://localhost/search?q=test&page=1");
		});

		test("handles array query parameters", () => {
			const url = buildClientUrl("http://localhost", ["filter"], {
				query: { types: ["a", "b"] },
			});
			expect(url.toString()).toBe("http://localhost/filter?types=a&types=b");
		});

		test("combines path and query parameters", () => {
			const url = buildClientUrl("http://localhost", ["users", ":id"], {
				params: { id: "123" },
				query: { active: true },
			});
			expect(url.toString()).toBe("http://localhost/users/123?active=true");
		});
	});

	describe("buildRequestInit", () => {
		test("sets method and default headers", () => {
			const init = buildRequestInit("get");
			expect(init.method).toBe("GET");
			expect(init.headers).toEqual({ "Content-Type": "application/json" });
			expect(init.body).toBeUndefined();
		});

		test("merges custom headers", () => {
			const init = buildRequestInit("post", {
				headers: { Authorization: "Bearer token" },
			});
			expect(init.headers).toEqual({
				"Content-Type": "application/json",
				Authorization: "Bearer token",
			});
		});

		test("stringifies JSON body", () => {
			const init = buildRequestInit("post", {
				body: { foo: "bar" },
			});
			expect(init.body).toBe('{"foo":"bar"}');
		});
	});

	describe("parseClientResponse", () => {
		test("parses JSON response correctly", async () => {
			const mockRes = new Response('{"hello":"world"}', {
				headers: { "Content-Type": "application/json" },
			});
			const data = await parseClientResponse(mockRes);
			expect(data).toEqual({ hello: "world" });
		});

		test("parses text response correctly", async () => {
			const mockRes = new Response("hello world", {
				headers: { "Content-Type": "text/plain" },
			});
			const data = await parseClientResponse(mockRes);
			expect(data).toBe("hello world");
		});

		test("throws on non-ok status", () => {
			const mockRes = new Response("Not Found", {
				status: 404,
				statusText: "Not Found",
			});
			expect(parseClientResponse(mockRes)).rejects.toThrow(
				"ServeX RPC Error: HTTP 404 Not Found",
			);
		});
	});
});
