import type { RPCContext, RPCMiddleware } from "./types";

// Compose a pre-flattened array of middlewares into a single callable
// This is called once per route compilation, not per request
export function composeMiddlewares(
	middlewares: RPCMiddleware[],
): (ctx: RPCContext, finalHandler: () => Promise<void>) => Promise<void> {
	return async (ctx, finalHandler) => {
		let index = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (i <= index) throw new Error("next() called multiple times");
			index = i;

			const fn = i < middlewares.length ? middlewares[i] : finalHandler;
			await fn(ctx, () => dispatch(i + 1));
		};

		await dispatch(0);
	};
}
