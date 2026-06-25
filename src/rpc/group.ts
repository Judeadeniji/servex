import type {
	RPCGroupBuilder,
	RPCGroupDef,
	RPCMiddleware,
	RPCRegistry,
} from './types';

export function createRPCGroup(): RPCGroupBuilder {
	return new RPCGroupBuilderImpl();
}

class RPCGroupBuilderImpl<T extends RPCRegistry = Record<string, never>>
	implements RPCGroupBuilder<T>
{
	private _middlewares: RPCMiddleware[] = [];

	middlewares(...fns: RPCMiddleware[]): RPCGroupBuilder<T> {
		const next = new RPCGroupBuilderImpl<T>();
		next._middlewares = [...this._middlewares, ...fns];
		return next;
	}

	register<R extends RPCRegistry>(registry: R): RPCGroupDef<R> {
		return {
			_tag: 'RPCGroup',
			middlewares: this._middlewares,
			registry,
		};
	}
}
