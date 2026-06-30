import { describe, expect, it } from "bun:test";
import {
    createStaticHandler,
    errorToResponse,
    mapCompactResponse,
    mapEarlyResponse,
    mapResponse,
} from "./handler";

describe("Web Standard Handler", () => {
	const defaultSet = () => ({ headers: {}, status: 200 });

	describe("mapResponse", () => {
		it("should map string and set text/plain", async () => {
			const res = await mapResponse("hello", defaultSet());
			expect(res.headers.get("content-type")).toBe("text/plain");
			expect(await res.text()).toBe("hello");
		});

		it("should map object to JSON and set application/json", async () => {
			const res = await mapResponse({ a: 1 }, defaultSet());
			expect(res.headers.get("content-type")).toBe("application/json");
			expect(await res.json()).toEqual({ a: 1 });
		});

		it("should map array to JSON and set application/json", async () => {
			const res = await mapResponse([1, 2], defaultSet());
			expect(res.headers.get("content-type")).toBe("application/json");
			expect(await res.json()).toEqual([1, 2]);
		});

		it("should not overwrite custom content-type", async () => {
			const res = await mapResponse("hello", {
				headers: { "content-type": "text/html" },
				status: 200,
			});
			expect(res.headers.get("content-type")).toBe("text/html");
		});

		it("should resolve promises", async () => {
			const res = await mapResponse(Promise.resolve("test"), defaultSet());
			expect(await res.text()).toBe("test");
		});
	});

	describe("mapEarlyResponse", () => {
		it("should return undefined for null or undefined", () => {
			expect(mapEarlyResponse(null, defaultSet())).toBeUndefined();
			expect(mapEarlyResponse(undefined, defaultSet())).toBeUndefined();
		});

		it("should map string and set text/plain", async () => {
			const res = await mapEarlyResponse("hello", defaultSet());
			expect(res).toBeDefined();
			expect(res!.headers.get("content-type")).toBe("text/plain");
			expect(await res!.text()).toBe("hello");
		});

		it("should fast path string without set", async () => {
			const res = (await mapEarlyResponse("fast", defaultSet()))!;
			expect(res.headers.get("content-type")).toBe("text/plain");
			expect(await res.text()).toBe("fast");
		});
	});

	describe("mapCompactResponse", () => {
		it("should map string and set text/plain", async () => {
			const res = await mapCompactResponse("hello");
			expect(res.headers.get("content-type")).toBe("text/plain");
			expect(await res.text()).toBe("hello");
		});

		it("should map object to JSON and set application/json", async () => {
			const res = await mapCompactResponse({ foo: "bar" });
			expect(res.headers.get("content-type")).toBe("application/json");
			expect(await res.json()).toEqual({ foo: "bar" });
		});

		it("should map error", async () => {
			const res = await mapCompactResponse(new Error("oops"));
			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.message).toBe("oops");
		});
	});

	describe("errorToResponse", () => {
		it("should handle standard errors", async () => {
			const res = await errorToResponse(new Error("test error"));
			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.message).toBe("test error");
		});

		it("should handle objects with toResponse method", async () => {
			const err = new Error("custom") as any;
			err.toResponse = () => new Response("custom response", { status: 400 });
			const res = await errorToResponse(err);
			expect(res.status).toBe(400);
			expect(await res.text()).toBe("custom response");
		});
	});

	describe("createStaticHandler", () => {
		it("should return a function that returns a cloned response", async () => {
			const handler = createStaticHandler("static content");
			expect(handler).toBeDefined();
			if (handler) {
				const res1 = handler();
				const res2 = handler();
				expect(res1).not.toBe(res2);
				expect(await res1.text()).toBe("static content");
				expect(await res2.text()).toBe("static content");
			}
		});

		it("should return undefined if there are hooks", () => {
			const handler = createStaticHandler("static content", {
				beforeHandle: [() => {}],
			});
			expect(handler).toBeUndefined();
		});

		it("should return undefined if handle is a function", () => {
			const handler = createStaticHandler(() => "dynamic content");
			expect(handler).toBeUndefined();
		});
	});
});
