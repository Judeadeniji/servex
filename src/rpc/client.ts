import { HttpException } from "../http-exception";
import { err, ok } from "./result";
import type { InferClientFromRegistry, RPCRegistry } from "./types";

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

function createProxy(
	options: RPCClientOptions,
	path: string[],
	precomputedPath?: string,
): unknown {
	const cache = new Map<string, unknown>();

	const endpointPath =
		precomputedPath ??
		(options.hash
			? `${options.baseURL}${options.prefix ?? "/rpc"}/${options.hash(path.join("."))}`
			: `${options.baseURL}${options.prefix ?? "/rpc"}${path.length > 0 ? "/" + path.join("/") : ""}`);

	return new Proxy(
		// Target must be a function so the proxy is callable
		() => {},
		{
			get(_, key: string) {
				if (typeof key !== "string" || key === "then") {
					return undefined;
				}
				let cached = cache.get(key);
				if (!cached) {
					cached = createProxy(options, [...path, key]);
					cache.set(key, cached);
				}
				return cached;
			},

			async apply(_, __, args) {
				// Called as a function — execute the RPC call
				const fetcher = options.fetch ?? globalThis.fetch;
				const response = await fetcher(endpointPath, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(args[0] ?? {}),
				});

				const data = await response.json();

				if (!data.ok || response.status >= 400) {
					const errCode = data.error?.code ?? data.error;
					const errMessage = data.error?.message ?? data.message;
					const errData = data.error?.data ?? data.data;

					return err(
						new HttpException({
							statusCode: response.status,
							error: errCode,
							message: errMessage,
							data: errData,
						}),
					);
				}

				return ok(data.data);
			},
		},
	);
}
