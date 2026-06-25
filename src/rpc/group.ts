import type {
	RPCGroupBuilder,
	RPCGroupDef,
	RPCMiddleware,
	RPCRegistry,
} from './types';

export function createRPCGroup(): RPCGroupBuilder {
	return new RPCGroupBuilderImpl();
}

// biome-ignore lint/complexity/noBannedTypes: Base registry type
class RPCGroupBuilderImpl<T extends RPCRegistry = {}>
	implements RPCGroupBuilder<T>
{
	private _middlewares: RPCMiddleware[] = [];

	middlewares(...fns: RPCMiddleware[]): RPCGroupBuilder<T> {
		this._middlewares.push(...fns);
		// biome-ignore lint/suspicious/noExplicitAny: Fluent builder type casting
		return this as any;
	}

	register<R extends RPCRegistry>(registry: R): RPCGroupDef<R> {
		return {
			_tag: 'RPCGroup',
			middlewares: this._middlewares,
			registry,
		};
	}
}
