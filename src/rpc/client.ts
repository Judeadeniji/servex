import { RPCError, RPCTypedError } from './error';
import type { InferClientFromRegistry, RPCRegistry } from './types';

export type RPCClientOptions = {
	baseURL: string;
	prefix?: string;
	hash?: (path: string) => string;
	fetch?: typeof globalThis.fetch;
};

export function createRPCClient<T>(
	options: RPCClientOptions,
): T extends { registry: infer R extends RPCRegistry }
	? InferClientFromRegistry<R>
	: InferClientFromRegistry<Record<string, never>> {
	return createProxy(options, []) as unknown as T extends {
		registry: infer R extends RPCRegistry;
	}
		? InferClientFromRegistry<R>
		: InferClientFromRegistry<Record<string, never>>;
}

function createProxy(options: RPCClientOptions, path: string[]): unknown {
	return new Proxy(
		// Target must be a function so the proxy is callable
		() => {},
		{
			get(_, key: string) {
				// Extend the path and return a new proxy
				return createProxy(options, [...path, key]);
			},

			async apply(_, __, args) {
				// Called as a function — execute the RPC call
				const dotPath = path.join('.');
				const httpPath = options.hash
					? `${options.baseURL}${options.prefix ?? '/rpc'}/${options.hash(dotPath)}`
					: `${options.baseURL}${options.prefix ?? '/rpc'}/${path.join('/')}`;

				const fetcher = options.fetch ?? globalThis.fetch;
				const response = await fetcher(httpPath, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(args[0] ?? {}),
				});

				const data = await response.json();

				if (!data.ok) {
					if (data.error.code === 'TYPED_ERROR') {
						return new RPCTypedError(data.error.data);
					}
					return new RPCError(
						data.error.code,
						data.error.message,
						data.error.data,
					);
				}

				return data.data;
			},
		},
	);
}
