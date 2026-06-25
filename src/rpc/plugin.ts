import type { Context as ServeXContext, Env, JSONValue, ServeXRouter } from '../types';
import { RPCError } from './error';
import { composeMiddlewares } from './middleware';
import { compileRoutes, type CompiledRoute, type CompileOptions } from './router';
import type { RPCContext, RPCPluginInstance, RPCRegistry } from './types';
import { validateInput, validateOutput } from './validation';

export type RPCPluginOptions = CompileOptions;

export function createRPCPlugin(options: RPCPluginOptions) {
	return new RPCPluginBuilder(options);
}

class RPCPluginBuilder {
	constructor(private options: RPCPluginOptions) {}

	register<R extends RPCRegistry>(registry: R): RPCPluginInstance<R> {
		const routeMap = compileRoutes(registry, this.options);
		return new RPCPluginInstanceImpl(routeMap, registry, this.options);
	}
}

class RPCPluginInstanceImpl<R extends RPCRegistry>
	implements RPCPluginInstance<R>
{
	constructor(
		private routeMap: Map<string, CompiledRoute>,
		public readonly registry: R, // kept for type export
		private options: RPCPluginOptions,
	) {}

	// Called by ServeX's plugin system
	install<E extends Env>(server: ServeXRouter<E>) {
		// Register a single catch-all POST handler under the prefix
		// If hashing is off, we can also register individual routes for debuggability
		const routePath = `${this.options.prefix}/*`;
		server.post(routePath, (ctx) => this.dispatch(ctx));
	}

	private async dispatch<E extends Env>(ctx: ServeXContext<E>) {
		const url = new URL(ctx.req.url);
		const pathname = url.pathname;

		// Find the matching compiled route by httpPath
		const route = [...this.routeMap.values()].find(
			(r) => r.httpPath === pathname,
		);

		if (!route) {
			return ctx.json({ ok: false, error: { code: 'NOT_FOUND' } }, 404);
		}

		let body: unknown;
		try {
			body = await ctx.req.json();
		} catch {
			return ctx.json(
				new RPCError('VALIDATION_ERROR', 'Invalid JSON body').toJSON(),
				400,
			);
		}

		// Build RPC context (extends ServeX context)
		const rpcCtx: RPCContext = Object.assign(ctx, {
			rpc: { fn: route.path, input: body },
		});

		try {
			// Validate input
			const validatedInput = await validateInput(route.fn.inputSchema, body);

			// Run middleware chain + handler
			let output: unknown;
			const composed = composeMiddlewares(route.middlewareChain);

			await composed(rpcCtx, async () => {
				output = await route.fn.handler(validatedInput, rpcCtx);
			});

			// Validate output
			const validatedOutput = await validateOutput(
				route.fn.outputSchema,
				output,
			);

			const isJSON = (val: unknown): val is JSONValue => true;
			if (isJSON(validatedOutput)) {
				return ctx.json({ ok: true, data: validatedOutput });
			}
			throw new RPCError('INTERNAL_ERROR', 'Invalid JSON output');
		} catch (err) {
			if (err instanceof RPCError) {
				const status =
					err.code === 'UNAUTHORIZED'
						? 401
						: err.code === 'NOT_FOUND'
							? 404
							: err.code === 'VALIDATION_ERROR'
								? 400
								: 500;
				return ctx.json(err.toJSON(), status);
			}

			// Unknown error — don't leak internals
			console.error('[ServeX RPC] Unhandled error:', err);
			return ctx.json(
				new RPCError(
					'INTERNAL_ERROR',
					'An unexpected error occurred',
				).toJSON(),
				500,
			);
		}
	}
}
