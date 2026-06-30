import { HttpException } from "../http-exception";
import type { Env, JSONValue, ServeXRouter } from "../types";
import { composeMiddlewares } from "./middleware";
import { type CompileOptions, compileRoutes } from "./router";
import type {
	InferClientFromRegistry,
	RPCContext,
	RPCPluginInstance,
} from "./types";
import { validateInput, validateOutput } from "./validation";

export type RPCPluginOptions = CompileOptions;

export function rpc<R extends Record<string, unknown>>(
	registry: R,
	options: Omit<RPCPluginOptions, "prefix"> = {},
): RPCPluginInstance<R> {
	return {
		name: "servex-rpc",
		registry,
		setup: <E extends Env, S, B extends string>(
			app: ServeXRouter<E, S, B>,
			prefix: string,
		) => {
			const routeMap = compileRoutes(registry, { ...options, prefix });

			for (const route of routeMap.values()) {
				// Strip prefix from the route's httpPath because the `app` is a sub-router
				// that is already mounted at `prefix` (e.g. `app.use('/rpc', plugin)`).
				const routePath = route.httpPath.startsWith(prefix) 
					? route.httpPath.slice(prefix.length) || "/" 
					: route.httpPath;

				app.post(routePath, async (ctx) => {
					let body: unknown;
					try {
						body = await ctx.req.json();
					} catch {
						return ctx.error(400, "Invalid JSON body", null, "VALIDATION_ERROR");
					}

					// Build RPC context (extends ServeX context)
					const rpcCtx: RPCContext = Object.assign(ctx, {
						rpc: { fn: route.path, input: body },
					});

					try {
						// Validate input
						const validatedInput = await validateInput(
							route.fn.inputSchema,
							body,
						);

						// Run middleware chain + handler
						let output: unknown;
						const composed = composeMiddlewares(route.middlewareChain);

						await composed(rpcCtx, async () => {
							output = await route.fn.handler(validatedInput, rpcCtx);
						});

						if (output instanceof Error) {
							throw output;
						}

						// Validate output
						const validatedOutput = await validateOutput(
							route.fn.outputSchema,
							output,
						);

						const isJSON = (val: unknown): val is JSONValue => true;
						if (isJSON(validatedOutput)) {
							return ctx.json({ ok: true, data: validatedOutput });
						}
						throw new HttpException({
							statusCode: 500,
							error: "INTERNAL_ERROR",
							message: "Invalid JSON output",
						});
					} catch (err) {
						if (err instanceof HttpException) {
							return err;
						}

						// Unknown error — don't leak internals
						console.error("[ServeX RPC] Unhandled error:", err);
						return ctx.error(
							500,
							"An unexpected error occurred",
							null,
							"INTERNAL_ERROR",
						);
					}
				});
			}

			return app as ServeXRouter<E, S & InferClientFromRegistry<R>, B>;
		},
	};
}
