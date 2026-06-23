import { bench, group, run } from "mitata";
import { compileHandlerChain } from "../src/compiler/index";
import type { Context } from "../src/context";
import { executeHandlers } from "../src/core/response";
import type { Handler } from "../src/types";

function generateChain(length: number): Handler<Context>[] {
	const chain: Handler<Context>[] = [];
	for (let i = 0; i < length - 1; i++) {
		chain.push(
			async (ctx: Context, next: () => Promise<Response | void>) => {
				(ctx as any).count = ((ctx as any).count || 0) + 1;
				await next();
			},
		);
	}
	chain.push(async (_ctx: Context) => new Response("OK"));
	return chain;
}

const mockContext = { count: 0 } as unknown as Context;

for (const len of [1, 3, 8, 20]) {
	const handlers = generateChain(len);
	const compiledFn = compileHandlerChain(handlers);

	group(`Chain Length: ${len}`, () => {
		bench(`Non-JIT executeHandlers (len=${len})`, async () => {
			await executeHandlers(mockContext, handlers);
		});

		bench(`JIT compileHandlerChain (len=${len})`, async () => {
			await compiledFn(mockContext);
		});
	});
}

await run();
