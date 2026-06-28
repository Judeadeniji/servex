import { bench, group, run } from "mitata";
import { compileHandlerChain } from "../../src/compiler/index";
import { type Context, createContext } from "../../src/context";
import type { Handler } from "../../src/types";
import { executeHandlers } from "../../src/core/response";

// Dummy Context
const req = new Request("http://localhost/");
const ctx = createContext(req, {}, {});

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

// Ensure both give the same result
async function verify() {
	const res1 = await executeHandlers(ctx, shortChain);
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
		bench("Native", () => executeHandlers(ctx, shortChain));
		bench("Compiled", () => compiledShort(ctx));
	});

	group("Long Chain (9 handlers)", () => {
		bench("Native", () => executeHandlers(ctx, longChain));
		bench("Compiled", () => compiledLong(ctx));
	});
});

await run();
