import type { JSONValue, } from "../types";
import { RPCError } from "./error";
import { composeMiddlewares } from "./middleware";
import { type CompileOptions, compileRoutes } from "./router";
import type { RPCContext, RPCPluginInstance } from "./types";
import { validateInput, validateOutput } from "./validation";

export type RPCPluginOptions = CompileOptions;

export function rpc<R extends Record<string, unknown>>(
	registry: R,
	options: Omit<RPCPluginOptions, "prefix"> = {},
): RPCPluginInstance<R> {
	return {
		name: "servex-rpc",
		registry,
		setup: (app, prefix) => {
			const routeMap = compileRoutes(registry, { ...options, prefix });

			app.post("/*", async (ctx) => {
				const url = new URL(ctx.req.url);
				const pathname = url.pathname;

				const route = [...routeMap.values()].find(
					(r) => r.httpPath === pathname,
				);

				if (!route) {
					return ctx.json({ ok: false, error: { code: "NOT_FOUND" } }, 404);
				}

				let body: unknown;
				try {
					body = await ctx.req.json();
				} catch {
					return ctx.json(
						new RPCError("VALIDATION_ERROR", "Invalid JSON body").toJSON(),
						400,
					);
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
					throw new RPCError("INTERNAL_ERROR", "Invalid JSON output");
				} catch (err) {
					if (err instanceof RPCError) {
						const status =
							err.code === "UNAUTHORIZED"
								? 401
								: err.code === "NOT_FOUND"
									? 404
									: err.code === "VALIDATION_ERROR"
										? 400
										: 500;
						return ctx.json(err.toJSON(), status);
					}

					// Unknown error — don't leak internals
					console.error("[ServeX RPC] Unhandled error:", err);
					return ctx.json(
						new RPCError(
							"INTERNAL_ERROR",
							"An unexpected error occurred",
						).toJSON(),
						500,
					);
				}
			});
		},
	};
}
