import { expect, test, describe } from "bun:test";
import { buildCompilerSource, compileHandlerChain } from "../src/compiler/index";
import { Context } from "../src/context";
import type { Handler } from "../src/types";

describe("JIT Compiler", () => {
	const req = new Request("http://localhost/");
	const ctx = new Context(req, {}, { params: {} });

	describe("buildCompilerSource (Code Generation)", () => {
		test("should generate empty async function for 0 handlers", () => {
			const source = buildCompilerSource([]);
			expect(source).toContain("return async () => undefined;");
		});

		test("should use localized next closures and nextCalled variables", () => {
			const handlers: Handler<any>[] = Array(5).fill((c: any, n: any) => n());
			const source = buildCompilerSource(handlers);
			expect(source).toContain("let nextCalled = false;");
			expect(source).toContain("const next = async () => {");
		});

		test("should omit 'next' arg for terminal handlers", () => {
			const syncNext: Handler<any> = (c, next) => next();
			const terminal: Handler<any> = (c) => new Response("OK");
			const source = buildCompilerSource([syncNext, terminal]);
			
			// Handler 0 (syncNext) should pass 'next'
			expect(source).toContain("deps.handlers[0](context, next)");
			// Handler 1 (terminal) should NOT pass 'next'
			expect(source).toContain("deps.handlers[1](context)");
		});
	});

	describe("compileHandlerChain (Execution)", () => {
		test("should execute a short chain correctly", async () => {
			const m1: Handler<any> = async (c, next) => {
				c.set("m1", true);
				return await next();
			};
			const m2: Handler<any> = (c) => new Response("OK");

			const fn = compileHandlerChain([m1, m2]);
			const res = await fn(ctx);

			expect(res).toBeInstanceOf(Response);
			expect(res?.status).toBe(200);
			expect(ctx.get("m1")).toBe(true);
		});

		test("should short-circuit if next() is not called", async () => {
			const m1: Handler<any> = (c) => new Response("Short Circuit");
			const m2: Handler<any> = () => { throw new Error("Should not run"); };

			const fn = compileHandlerChain([m1, m2]);
			const res = await fn(ctx);

			expect(res).toBeInstanceOf(Response);
			expect(await res?.text()).toBe("Short Circuit");
		});

		test("should throw if next() is called multiple times", async () => {
			const m1: Handler<any> = async (c, next) => {
				await next();
				await next();
			};
			const m2: Handler<any> = (c) => new Response("OK");

			const fn = compileHandlerChain([m1, m2]);
			
			let error;
			try {
				await fn(ctx);
			} catch (e) {
				error = e;
			}
			
			expect(error).toBeDefined();
			expect((error as Error).message).toBe("next() called multiple times");
		});
	});
});
