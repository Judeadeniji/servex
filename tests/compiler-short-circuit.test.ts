import { describe, expect, it } from "bun:test";
import { compileHandlerChain } from "../src/compiler/index";
import type { Context } from "../src/context";
import type { Handler } from "../src/types";

const mockRequest = new Request("http://localhost/");
const createMockContext = () =>
	({
		req: mockRequest,
		header: new Headers(),
		executionCtx: null,
		deferred: [],
	}) as unknown as Context;

describe("JIT Compiler - Short Circuiting & Edge Cases", () => {
	it("Index 0: Short-circuits correctly", async () => {
		const handlers: Handler[] = [
			async () => new Response("0"),
			async () => {
				throw new Error("Should not reach");
			},
		];
		const fn = compileHandlerChain(handlers);
		const res = await fn(createMockContext()) as Response;
		expect(res?.status).toBe(200);
		expect(await res!.text()).toBe("0");
	});

	it("Index Middle: Short-circuits correctly", async () => {
		const handlers: Handler[] = [
			async (_, next) => {
				await next();
			},
			async () => new Response("1"),
			async () => {
				throw new Error("Should not reach");
			},
		];
		const fn = compileHandlerChain(handlers);
		const res = await fn(createMockContext()) as Response;
		expect(res?.status).toBe(200);
		expect(await res!.text()).toBe("1");
	});

	it("Index Last: Resolves properly", async () => {
		const handlers: Handler[] = [
			async (_, next) => {
				await next();
			},
			async (_, next) => {
				await next();
			},
			async () => new Response("2"),
		];
		const fn = compileHandlerChain(handlers);
		const res = await fn(createMockContext()) as Response;
		expect(res?.status).toBe(200);
		expect(await res!.text()).toBe("2");
	});

	it("Error Throw: Propagates correctly", async () => {
		const handlers: Handler[] = [
			async (_, next) => {
				try {
					await next();
				} catch (e: unknown) {
					return new Response((e as Error).message, { status: 500 });
				}
			},
			async () => {
				throw new Error("Mid-chain error");
			},
			async () => {
				throw new Error("Should not reach");
			},
		];
		const fn = compileHandlerChain(handlers);
		const res = await fn(createMockContext()) as Response;
		expect(res?.status).toBe(500);
		expect(await res!.text()).toBe("Mid-chain error");
	});

	it("No Response: Resolves to undefined", async () => {
		const handlers: Handler[] = [
			async (_, next) => {
				await next();
			},
			async (_, next) => {
				await next();
			},
		];
		const fn = compileHandlerChain(handlers);
		const res = await fn(createMockContext()) as Response;
		expect(res).toBeUndefined();
	});
});
