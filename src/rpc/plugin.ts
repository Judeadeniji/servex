import type { Context as ServeXContext, ServeXRouter } from '../types';
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
	// biome-ignore lint/suspicious/noExplicitAny: App router type
	install(server: ServeXRouter<any>) {
		// Register a single catch-all POST handler under the prefix
		// If hashing is off, we can also register individual routes for debuggability
		// biome-ignore lint/suspicious/noExplicitAny: Internal dynamic route registration bypasses strict string constraints
		server.post(`${this.options.prefix}/*` as any, this.dispatch.bind(this) as any);
	}

	private async dispatch(ctx: ServeXContext) {
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
				// biome-ignore lint/suspicious/noExplicitAny: JSON value
				new RPCError('VALIDATION_ERROR', 'Invalid JSON body').toJSON() as any,
				400,
			);
		}

		// Build RPC context (extends ServeX context)
		const rpcCtx: RPCContext = Object.assign(Object.create(Object.getPrototypeOf(ctx)), ctx, {
			rpc: { fn: route.path, input: body },
		}) as unknown as RPCContext;

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

			// biome-ignore lint/suspicious/noExplicitAny: JSON value
			return ctx.json({ ok: true, data: validatedOutput } as any);
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
				// biome-ignore lint/suspicious/noExplicitAny: JSON value
				return ctx.json(err.toJSON() as any, status);
			}

			// Unknown error — don't leak internals
			console.error('[ServeX RPC] Unhandled error:', err);
			return ctx.json(
				new RPCError(
					'INTERNAL_ERROR',
					'An unexpected error occurred',
				// biome-ignore lint/suspicious/noExplicitAny: JSON value
				).toJSON() as any,
				500,
			);
		}
	}
}
