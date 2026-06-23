import { bench, group, run } from "mitata";
import { compileHandlerChain } from "../../src/compiler/index";
import { type Context, createContext } from "../../src/context";
import type { Handler } from "../../src/types";

// Dummy Context
const req = new Request("http://localhost/");
const ctx = createContext(req, {}, { params: {} });

// Dummy Handlers
const syncHandler: Handler<Context> = (_c, next) => next();
const asyncHandler: Handler<Context> = async (_c, next) => await next();
const terminalHandler: Handler<Context> = () => new Response("OK");

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
async function executeNative(handlers: Handler<Context>[], context: Context) {
	async function dispatch(i: number): Promise<Response | undefined> {
		if (i >= handlers.length) return undefined;
		const handler = handlers[i];
		let nextCalled = false;
		let nextPromise: Promise<Response | undefined> | undefined;

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
	if (
		!(res1 instanceof Response) ||
		!(res2 instanceof Response) ||
		res1.status !== res2.status
	) {
		throw new Error("Mismatch in outputs");
	}
}

await verify();

group("Compiler", () => {
	group("Short Chain (3 handlers)", () => {
		bench("Native", () => executeNative(shortChain, ctx));
		bench("Compiled", () => compiledShort(ctx));
	});

	group("Long Chain (9 handlers)", () => {
		bench("Native", () => executeNative(longChain, ctx));
		bench("Compiled", () => compiledLong(ctx));
	});
});

await run();
