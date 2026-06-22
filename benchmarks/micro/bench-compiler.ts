import { compileHandlerChain } from "../../src/compiler/index";
import { Context } from "../../src/context";
import type { Handler } from "../../src/types";

const ITERATIONS = 1_000_000;

// Dummy Context
const req = new Request("http://localhost/");
const ctx = new Context(req, {}, { params: {} });

// Dummy Handlers
const syncHandler: Handler<any> = (c, next) => next();
const asyncHandler: Handler<any> = async (c, next) => await next();
const terminalHandler: Handler<any> = () => new Response("OK");

// Chains
const shortChain = [syncHandler, asyncHandler, terminalHandler];
const longChain = [
	syncHandler,
	asyncHandler,
	syncHandler,
	asyncHandler,
	syncHandler,
	asyncHandler,
	syncHandler,
	asyncHandler,
	terminalHandler,
];

// Compiled version
const compiledShort = compileHandlerChain(shortChain);
const compiledLong = compileHandlerChain(longChain);

// Native execution simulation (uncompiled recursive dispatch)
async function executeNative(handlers: Handler<any>[], context: Context<any>) {
	async function dispatch(i: number): Promise<Response | undefined | void> {
		if (i >= handlers.length) return undefined;
		const handler = handlers[i];
		let nextCalled = false;
		let nextPromise: Promise<Response | undefined | void> | undefined;

		const next = async () => {
			if (nextCalled) throw new Error("next() called multiple times");
			nextCalled = true;
			nextPromise = dispatch(i + 1);
			return await nextPromise;
		};

		let res = handler(context, next);
		if (res instanceof Promise) res = await res;

		if (res instanceof Response) return res;
		if (nextCalled && nextPromise) return await nextPromise;
		return undefined;
	}
	return dispatch(0);
}

// Ensure both give the same result
async function verify() {
	const res1 = await executeNative(shortChain, ctx);
	const res2 = await compiledShort(ctx);
	if (!(res1 instanceof Response) || !(res2 instanceof Response) || res1.status !== res2.status) {
		throw new Error("Mismatch in outputs");
	}
}

async function benchmark(name: string, fn: () => Promise<any> | any, iterations = ITERATIONS) {
	// Warmup
	for (let i = 0; i < 1000; i++) {
		await fn();
	}

	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await fn();
	}
	const end = performance.now();

	const timeMs = end - start;
	const opsPerSec = (iterations / (timeMs / 1000)).toFixed(0);
	console.log(`| ${name.padEnd(35)} | ${opsPerSec.padStart(12)} ops/sec | ${timeMs.toFixed(2).padStart(8)}ms |`);
}

async function run() {
	await verify();
	console.log("=========================================================================");
	console.log("| Benchmark                           | Performance      | Total Time |");
	console.log("|-------------------------------------|------------------|------------|");

	await benchmark("Native Short Chain (3 handlers)", () => executeNative(shortChain, ctx));
	await benchmark("Compiled Short Chain (3 handlers)", () => compiledShort(ctx));

	await benchmark("Native Long Chain (9 handlers)", () => executeNative(longChain, ctx));
	await benchmark("Compiled Long Chain (9 handlers)", () => compiledLong(ctx));

	console.log("=========================================================================");
}

run().catch(console.error);
