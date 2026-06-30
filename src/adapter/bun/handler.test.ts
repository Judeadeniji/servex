import { describe, expect, it } from "bun:test";
import { HttpException } from "../../../src/errors";
import {
    createStaticHandler,
    errorToResponse,
    mapCompactResponse,
    mapEarlyResponse,
    mapResponse,
} from "./handler";

describe("Bun Handler", () => {
	const defaultSet = () => ({ headers: {}, status: 200 });

	describe("mapResponse", () => {
		it("should map string", async () => {
			const res = await mapResponse("hello", defaultSet());
			expect(await res.text()).toBe("hello");
		});

		it("should map object to JSON", async () => {
			const res = await mapResponse({ a: 1 }, defaultSet());
			expect(res.headers.get("content-type")).toContain("application/json");
			expect(await res.json()).toEqual({ a: 1 });
		});

		it("should resolve promises", async () => {
			const res = await mapResponse(Promise.resolve("test"), defaultSet()) as Response;
			expect(await res.text()).toBe("test");
		});

		it("should apply custom headers and status", async () => {
			const res = await mapResponse("test", { headers: { "x-test": "1" }, status: 201 });
			expect(res.status).toBe(201);
			expect(res.headers.get("x-test")).toBe("1");
		});
	});

	describe("mapEarlyResponse", () => {
		it("should return undefined for null or undefined", () => {
			expect(mapEarlyResponse(null, defaultSet())).toBeUndefined();
			expect(mapEarlyResponse(undefined, defaultSet())).toBeUndefined();
		});

		it("should map string", async () => {
			const res = await mapEarlyResponse("hello", defaultSet());
			expect(res).toBeDefined();
			expect(await res!.text()).toBe("hello");
		});
	});

	describe("mapCompactResponse", () => {
		it("should map without applying set", async () => {
			const res = await mapCompactResponse("hello");
			expect(await res.text()).toBe("hello");
			expect(res.headers.has("content-type")).toBe(false); // Bun relies on native Engine to append default headers
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

		it("should handle HttpException", async () => {
			const err = new HttpException({ statusCode: 404, data: "Not Found" });
			const res = await errorToResponse(err);
			expect(res.status).toBe(404);
			const json = await res.json();
			expect(json.data).toBe("Not Found");
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
