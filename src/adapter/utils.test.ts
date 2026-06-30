import { describe, expect, it } from "bun:test";
import {
	handleFile,
	handleSet,
	mergeHeaders,
	mergeStatus,
	parseSetCookies,
	responseToSetHeaders,
	createStreamHandler,
	streamResponse,
	createResponseHandler,
	type ResponseSet,
} from "./utils";

describe("Adapter Utils", () => {
	describe("handleFile", () => {
		it("should return a basic Response if no set is provided", async () => {
			const blob = new Blob(["test"], { type: "text/plain" });
			const response = handleFile(blob);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe("test");
		});

		it("should handle partial content range requests", async () => {
			const blob = new Blob(["abcdefg"], { type: "text/plain" });
			const request = new Request("http://localhost", {
				headers: { range: "bytes=1-3" },
			});
			const response = handleFile(blob, undefined, request);
			expect(response.status).toBe(206);
			expect(response.headers.get("content-range")).toBe("bytes 1-3/7");
			expect(await response.text()).toBe("bcd");
		});

		it("should return 416 for invalid range", async () => {
			const blob = new Blob(["abcdefg"], { type: "text/plain" });
			const request = new Request("http://localhost", {
				headers: { range: "bytes=10-20" },
			});
			const response = handleFile(blob, undefined, request);
			expect(response.status).toBe(416);
		});

		it("should return 416 for malformed range", async () => {
			const blob = new Blob(["abcdefg"], { type: "text/plain" });
			const request = new Request("http://localhost", {
				headers: { range: "bytes=-" },
			});
			const response = handleFile(blob, undefined, request);
			expect(response.status).toBe(416);
		});

		it("should use suffix range (e.g., -3)", async () => {
			const blob = new Blob(["abcdefg"], { type: "text/plain" });
			const request = new Request("http://localhost", {
				headers: { range: "bytes=-3" },
			});
			const response = handleFile(blob, undefined, request);
			expect(response.status).toBe(206);
			expect(response.headers.get("content-range")).toBe("bytes 4-6/7");
			expect(await response.text()).toBe("efg");
		});

		it("should merge custom headers", () => {
			const blob = new Blob(["test"]);
			const response = handleFile(blob, {
				status: 200,
				headers: { "x-custom": "test" },
			});
			expect(response.headers.get("x-custom")).toBe("test");
		});
	});

	describe("parseSetCookies", () => {
		it("should split multiple cookies", () => {
			const headers = new Headers();
			parseSetCookies(headers, ["a=1", "b=2; HttpOnly"]);
			const cookies = headers.getAll("set-cookie");
			expect(cookies).toContain("a=1");
			expect(cookies).toContain("b=2; HttpOnly");
		});
	});

	describe("handleSet", () => {
		it("should format string status to number", () => {
			const set: ResponseSet = { headers: {}, status: "Not Found" };
			handleSet(set);
			expect(set.status).toBe(404);
		});

		it("should serialize cookie bag", () => {
			const set: ResponseSet = {
				headers: {},
				status: 200,
				cookie: { a: 1, b: "two" },
			};
			handleSet(set);
			expect((set.headers as Record<string, any>)["set-cookie"]).toBe(
				"a=1; b=two",
			);
		});

		it("should parse array set-cookie headers", () => {
			const set: ResponseSet = {
				headers: { "set-cookie": ["a=1", "b=2"] } as any,
				status: 200,
			};
			handleSet(set);
			expect((set.headers as Headers).getSetCookie).toBeDefined();
			expect((set.headers as Headers).getSetCookie()).toContain("a=1");
			expect((set.headers as Headers).getSetCookie()).toContain("b=2");
		});
	});

	describe("mergeHeaders", () => {
		it("should prioritize response headers but include set headers", () => {
			const responseHeaders = new Headers({ a: "1", b: "2" });
			const merged = mergeHeaders(responseHeaders, { b: "3", c: "4" });
			expect(merged.get("a")).toBe("1");
			expect(merged.get("b")).toBe("2");
			expect(merged.get("c")).toBe("4");
		});

		it("should append multiple set-cookies", () => {
			const responseHeaders = new Headers();
			responseHeaders.append("set-cookie", "a=1");
			const setHeaders = new Headers();
			setHeaders.append("set-cookie", "b=2");
			const merged = mergeHeaders(responseHeaders, setHeaders);
			const cookies = merged.getSetCookie();
			expect(cookies).toContain("a=1");
			expect(cookies).toContain("b=2");
		});
	});

	describe("mergeStatus", () => {
		it("should use response status if not 200", () => {
			expect(mergeStatus(404, 500)).toBe(404);
		});

		it("should use set status if response status is 200", () => {
			expect(mergeStatus(200, 500)).toBe(500);
			expect(mergeStatus(200, "Created")).toBe(201);
		});
	});

	describe("responseToSetHeaders", () => {
		it("should populate set from response headers", () => {
			const response = new Response(null, {
				status: 201,
				headers: { "x-custom": "test" },
			});
			const set = responseToSetHeaders(response);
			expect(set.status).toBe(201);
			expect((set.headers as Record<string, any>)["x-custom"]).toBe("test");
		});

		it("should skip content-encoding header", () => {
			const response = new Response(null, {
				headers: { "content-encoding": "gzip", "x-custom": "test" },
			});
			const set = responseToSetHeaders(response);
			expect(
				(set.headers as Record<string, any>)["content-encoding"],
			).toBeUndefined();
			expect((set.headers as Record<string, any>)["x-custom"]).toBe("test");
		});
	});

	describe("streamResponse", () => {
		it("should yield chunks from a response body", async () => {
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue("chunk1 ");
					controller.enqueue("chunk2");
					controller.close();
				},
			});
			const response = new Response(stream);
			const chunks = [];
			for await (const chunk of streamResponse(response)) {
				chunks.push(chunk);
			}
			expect(chunks.join("")).toBe("chunk1 chunk2");
		});
	});

	describe("createStreamHandler", () => {
		const mockHandlers = {
			mapResponse: (r: any) => new Response(r),
			mapCompactResponse: (r: any) => new Response(r),
		};

		it("should handle a generator", async () => {
			function* gen() {
				yield "a";
				yield "b";
			}
			const handle = createStreamHandler(mockHandlers);
			const response = await handle(gen());
			expect(response.headers.get("transfer-encoding")).toBe("chunked");
			const text = await response.text();
			expect(text).toBe("ab");
		});

		it("should format as SSE if requested", async () => {
			async function* gen() {
				yield "a";
				yield "b";
			}
			const handle = createStreamHandler(mockHandlers);
			const response = await handle(gen(), {
				headers: { "content-type": "text/event-stream" },
				status: 200,
			});
			const text = await response.text();
			expect(text).toBe("data: a\n\ndata: b\n\n");
		});
	});

	describe("createResponseHandler", () => {
		it("should wrap response and merge headers", async () => {
			const mockHandlers = {
				mapResponse: (r: BodyInit) => new Response(r),
				mapCompactResponse: (r: BodyInit) => new Response(r),
			};
			const handle = createResponseHandler(mockHandlers);
			const original = new Response("test", {
				status: 404,
				headers: { a: "1" },
			});
			const newRes = await handle(original, {
				headers: { b: "2" },
				status: 200,
			});
			expect(newRes.status).toBe(404); // response status wins
			expect(newRes.headers.get("a")).toBe("1");
			expect(newRes.headers.get("b")).toBe("2");
		});
	});
});
