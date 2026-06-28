import { bench, group, run } from "mitata";
import { compileHandlerChain } from "../src/compiler/index";
import { executeHandlers } from "../src/core/response";
import type { Context, Handler } from "../src/types";

type MockContext = { count: number } & Context;

function generateChain(length: number): Handler<MockContext>[] {
	const chain: Handler<MockContext>[] = [];
	for (let i = 0; i < length - 1; i++) {
		chain.push(
			// biome-ignore lint/suspicious/noConfusingVoidType: void is valid
			async (ctx: MockContext, next: () => Promise<Response | void>) => {
				ctx.count = (ctx.count || 0) + 1;
				await next();
			},
		);
	}
	chain.push(async (_ctx: Context) => new Response("OK"));
	return chain;
}

const mockContext = { count: 0 } as unknown as MockContext;

for (const len of [1, 3, 8, 20]) {
	const handlers = generateChain(len);
	const compiledFn = compileHandlerChain(handlers as Handler[]);

	group(`Chain Length: ${len}`, () => {
		bench(`Non-JIT executeHandlers (len=${len})`, async () => {
			await executeHandlers(mockContext, handlers as Handler[]);
		});

		bench(`JIT compileHandlerChain (len=${len})`, async () => {
			await compiledFn(mockContext);
		});
	});
}

await run();
