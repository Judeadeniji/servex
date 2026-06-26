import type { RPCFunctionDef, RPCGroupDef, RPCMiddleware, RPCRegistry } from './types';

export type CompiledRoute = {
	path: string; // e.g. 'users.getUser'
	httpPath: string; // e.g. '/rpc/users/getUser' (or hashed)
	fn: RPCFunctionDef<unknown, unknown, unknown>;
	middlewareChain: RPCMiddleware[]; // flattened, ordered: group -> fn-level
};

export type CompileOptions = {
	prefix: string;
	hash?: (path: string) => string;
};

export function compileRoutes(
	registry: RPCRegistry,
	options: CompileOptions,
	parentMiddlewares: RPCMiddleware[] = [],
	parentPath: string[] = [],
): Map<string, CompiledRoute> {
	const map = new Map<string, CompiledRoute>();

	for (const [key, _value] of Object.entries(registry)) {
		const value = _value as RPCFunctionDef<unknown, unknown, unknown> | RPCGroupDef<Record<string, unknown>>;
		const currentPath = [...parentPath, key];
		const dotPath = currentPath.join('.');

		if (value._tag === 'RPCFunction') {
			// Compose middleware chain: parent groups -> fn-level
			const middlewareChain = [...parentMiddlewares, ...value.middlewares];

			const rawHttpPath = `${options.prefix}/${currentPath.join('/')}`;
			const httpPath = options.hash
				? `${options.prefix}/${options.hash(dotPath)}`
				: rawHttpPath;

			map.set(dotPath, {
				path: dotPath,
				httpPath,
				fn: value,
				middlewareChain,
			});
		} else if (value._tag === 'RPCGroup') {
			// Recurse into subgroup, passing down accumulated middlewares
			const subRoutes = compileRoutes(
				value.registry,
				options,
				[...parentMiddlewares, ...value.middlewares],
				currentPath,
			);
			for (const [k, v] of subRoutes) {
				map.set(k, v);
			}
		}
	}

	return map;
}
