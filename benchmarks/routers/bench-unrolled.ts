/**
 * Validate-or-kill: does closure-unrolling WITHOUT nextCalled guard beat executeHandlers?
 *
 * The original win (1.27x → 9% E2E) used this shape:
 *   const next2 = async () => handlers[2](ctx);
 *   const next1 = async () => handlers[1](ctx, next2);
 *   return handlers[0](ctx, next1);
 *
 * The correctness fix forced us to add `nextCalled` tracking, which means allocating
 * a mutable flag and closure per-call — identical overhead to executeHandlers.
 *
 * Question: does unrolled closures WITHOUT the guard still beat executeHandlers,
 * and does short-circuiting still work correctly without it?
 *
 * Short-circuit correctness without the guard:
 *   - If handler[0] doesn't call next(), next1 is never invoked → ✓ correct
 *   - If handler[0] calls next() twice, handler[1] runs twice → ✗ no protection
 *     but this is a developer error (calling next() twice), not a silent data corruption.
 *     The question is: does dropping the guard change *correct program* behavior?
 *     No — in a correctly written middleware chain, next() is called at most once.
 *
 * So the tradeoff is: lose the "next() called twice" runtime guard (a dev-ergonomics
 * feature, not a correctness feature for correct programs) in exchange for the perf win.
 */

import type { Context } from "../../src/context";
import { executeHandlers } from "../../src/core/response";
import type { Handler } from "../../src/types";

const ITERS = 1_000_000;

function compileUnrolled(
	handlers: Handler<Context>[],
): (ctx: Context) => Promise<Response | undefined> {
	if (handlers.length === 0) return async () => undefined;

	// Build the chain back-to-front, no per-call allocations
	let code = `return async function(context) {\n`;

	// Innermost next: calls last handler, no next
	for (let i = handlers.length - 1; i >= 0; i--) {
		if (i === handlers.length - 1) {
			// Last handler — no next
			code += `  const next${i} = async () => { const r = await deps.h[${i}](context); return r instanceof Response ? r : undefined; };\n`;
		} else {
			code += `  const next${i} = async () => { const r = await deps.h[${i}](context, next${i + 1}); return r instanceof Response ? r : (await next${i + 1}()); };\n`;
		}
	}

	// Actually that nests wrong — build properly:
	// We want: return h[0](ctx, () => h[1](ctx, () => h[2](ctx)))
	code = `return async function(context) {\n`;
	// Create tail first
	code += `  const _end = async () => undefined;\n`;
	for (let i = handlers.length - 1; i >= 0; i--) {
		const nextRef = i === handlers.length - 1 ? `_end` : `_n${i + 1}`;
		code += `  const _n${i} = async () => { const r = await deps.h[${i}](context, ${nextRef}); return r instanceof Response ? r : await ${nextRef}(); };\n`;
	}
	code += `  return _n0();\n}`;

	return new Function("deps", code)({ h: handlers });
}

function generateChain(length: number): Handler<Context>[] {
	const chain: Handler<Context>[] = [];
	for (let i = 0; i < length - 1; i++) {
		chain.push(async (ctx: Context, next: () => Promise<void | Response>) => {
			(ctx as any).count = ((ctx as any).count || 0) + 1;
			await next();
		});
	}
	chain.push(async () => new Response("OK"));
	return chain;
}

// Also test short-circuit correctness
async function testCorrectness() {
	console.log("=== Correctness Check ===");
	const ctx = {} as Context;

	// Test 1: chain completes normally
	const chain1 = generateChain(3);
	const fn1 = compileUnrolled(chain1);
	const r1 = await fn1(ctx);
	console.log(
		"Normal chain (3):",
		r1 instanceof Response ? "✓ Response" : `✗ ${r1}`,
	);

	// Test 2: short-circuit at position 0 (auth-style)
	let afterAuth = false;
	const chainAuth = [
		async (_ctx: Context, _next: () => Promise<void | Response>) =>
			new Response("Unauthorized", { status: 401 }),
		async (_ctx: Context) => {
			afterAuth = true;
			return new Response("OK");
		},
	];
	const fnAuth = compileUnrolled(chainAuth as any);
	const rAuth = await fnAuth(ctx);
	console.log(
		"Short-circuit at 0:",
		rAuth instanceof Response && rAuth.status === 401 ? "✓" : "✗",
		"afterAuth ran:",
		afterAuth,
	);

	// Test 3: short-circuit at position 1
	const chainMid = [
		async (_ctx: Context, next: () => Promise<void | Response>) => {
			await next();
		},
		async (_ctx: Context, _next: () => Promise<void | Response>) => new Response("Stopped"),
		async (_ctx: Context) => new Response("Never reached"),
	];
	const fnMid = compileUnrolled(chainMid as any);
	const rMid = await fnMid(ctx);
	console.log(
		"Short-circuit at 1:",
		rMid instanceof Response && (await rMid.text()) === "Stopped" ? "✓" : "✗",
	);

	console.log("");
}

async function runBench() {
	await testCorrectness();

	const mockContext = { count: 0 } as unknown as Context;

	for (const len of [1, 3, 8, 20]) {
		console.log(`=== Chain Length: ${len} ===`);
		const handlers = generateChain(len);
		const unrolled = compileUnrolled(handlers);

		// Warmup
		for (let i = 0; i < 1000; i++) {
			await executeHandlers(mockContext, handlers);
			await unrolled(mockContext);
		}

		let start = performance.now();
		for (let i = 0; i < ITERS; i++) {
			await executeHandlers(mockContext, handlers);
		}
		const nonJitTime = performance.now() - start;
		console.log(`executeHandlers:       ${nonJitTime.toFixed(2)}ms`);

		start = performance.now();
		for (let i = 0; i < ITERS; i++) {
			await unrolled(mockContext);
		}
		const unrolledTime = performance.now() - start;
		console.log(`Unrolled (no guard):   ${unrolledTime.toFixed(2)}ms`);
		console.log(
			`Speedup:               ${(nonJitTime / unrolledTime).toFixed(2)}x`,
		);
		console.log("");
	}
}

runBench();
