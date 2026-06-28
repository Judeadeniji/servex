import { bench, group, run } from "mitata";
import { compileHandlerChain } from "../src/compiler/index";
import type { Context } from "../src/context";
import { createServer } from "../src/index";
import { RouterType } from "../src/router/adapter";
import type { Handler, MiddlewareHandler } from "../src/types";

// Helper to generate N handlers
function generateChain(length: number): Handler[] {
	const chain: Handler[] = [];
	for (let i = 0; i < length - 1; i++) {
		chain.push(async (ctx: Context, next) => {
			ctx.executionCtx = ((ctx.executionCtx as number) || 0) + 1;
			await next();
		});
	}
	chain.push((_ctx: Context) => new Response("OK"));
	return chain;
}

const mockRequest = new Request("http://localhost/");
const _createMockContext = () =>
	({
		req: mockRequest,
		header: new Headers(),
		executionCtx: null,
		deferred: [],
	}) as unknown as Context;

group("JIT Boot Time Cost", () => {
	const handlers = generateChain(5);
	bench("Compiling 1000 routes (len 5)", () => {
		for (let i = 0; i < 1000; i++) {
			compileHandlerChain(handlers);
		}
	});
});

// Set up Non-JIT App (using new config flag)
const middlewares: MiddlewareHandler<Context>[] = [
	async (ctx, next) => {
		ctx.executionCtx = 1;
		await next();
	},
	async (ctx, next) => {
		ctx.executionCtx = 2;
		await next();
	},
	(_ctx) => new Response("Hello"),
];
const appNonJit = createServer({
	router: RouterType.SONIC,
	jit: false,
	middlewares: [middlewares[0], middlewares[1]],
});
appNonJit.get("/api/test", middlewares[2]);

// Set up JIT App
const appJit = createServer({ router: RouterType.SONIC, jit: true });
appJit.get("/api/test", middlewares[2]);
// biome-ignore lint/suspicious/noExplicitAny: Internal router access for benchmark warmup
(appJit as any).middlewares.push(middlewares[0], middlewares[1]);

// Warmup JIT
for (let i = 0; i < 5000; i++)
	await appJit.fetch(new Request("http://localhost/api/test"));

// Full Warmup for Non-JIT now that it's patched
for (let i = 0; i < 5000; i++)
	await appNonJit.fetch(new Request("http://localhost/api/test"));

group("End-to-End Realism Test (3 handlers)", () => {
	bench("E2E Non-JIT", async () => {
		await appNonJit.fetch(new Request("http://localhost/api/test"));
	});

	bench("E2E JIT", async () => {
		await appJit.fetch(new Request("http://localhost/api/test"));
	});
});

await run();
