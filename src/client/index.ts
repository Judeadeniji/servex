import type { ServeXRouter } from "../types";
import { SUPPORTED_METHODS } from "../utils";
import { buildClientUrl, buildRequestInit, parseClientResponse } from "./utils";

export type MethodMethods =
	| "GET"
	| "POST"
	| "PUT"
	| "DELETE"
	| "PATCH"
	| "OPTIONS"
	| "HEAD";

type LowerMethod<M extends string> = M extends "GET"
	? "get"
	: M extends "POST"
		? "post"
		: M extends "PUT"
			? "put"
			: M extends "DELETE"
				? "delete"
				: M extends "PATCH"
					? "patch"
					: M extends "OPTIONS"
						? "options"
						: M extends "HEAD"
							? "head"
							: never;

export type RequestOptions<Req = unknown> = {
	params?: Record<string, string | number>;
	query?: Record<string, string | number | boolean | string[]>;
	body?: Req;
	headers?: Record<string, string>;
	onRequest?: (req: Request) => Request | Promise<Request>;
	onResponse?: (res: Response) => Response | Promise<Response>;
};

// Extracts _data from TypedResponse. Falls back to unknown if not a TypedResponse.
type ExtractData<T> = T extends { _data: infer D } ? D : unknown;

export type MethodCaller<RouteData> = {
	[M in keyof RouteData as M extends MethodMethods ? LowerMethod<M> : never]: (
		options?: RequestOptions<unknown>,
	) => Promise<ExtractData<RouteData[M]>>;
};

type GetNextSegment<
	Path extends string,
	Prefix extends string,
> = Prefix extends ""
	? Path extends `/${infer Next}/${string}`
		? Next
		: Path extends `/${infer Next}`
			? Next
			: never
	: Path extends `${Prefix}/${infer Next}/${string}`
		? Next
		: Path extends `${Prefix}/${infer Next}`
			? Next
			: never;

type ValidNextSegments<TRoutes, Prefix extends string> = {
	[K in keyof TRoutes]: GetNextSegment<K & string, Prefix>;
}[keyof TRoutes] &
	string;

// The recursive proxy type
export type ClientNode<
	TRoutes,
	Prefix extends string = "",
> = (Prefix extends keyof TRoutes ? MethodCaller<TRoutes[Prefix]> : unknown) & {
	[K in ValidNextSegments<TRoutes, Prefix>]: ClientNode<
		TRoutes,
		Prefix extends "" ? `/${K}` : `${Prefix}/${K}`
	>;
};

export type Client<TApp> =
	// biome-ignore lint/suspicious/noExplicitAny: Required for broad generic inference of the app instance
	TApp extends ServeXRouter<any, infer S, any> ? ClientNode<S> : never;

type FetchLike =
	| ((
			input: RequestInfo | URL,
			init?: RequestInit,
	  ) => Promise<Response> | Response)
	// biome-ignore lint/suspicious/noExplicitAny: any is needed here
	| ((request: Request, ...args: any[]) => Promise<Response> | Response);

export interface ClientOptions {
	fetch?: FetchLike;
	onRequest?: (req: Request) => Request | Promise<Request>;
	onResponse?: (res: Response) => Response | Promise<Response>;
}

/**
 * Creates a fully-typed RPC-like client for a ServeX app.
 *
 * @example
 * const client = createClient<MyApp>("http://localhost:3000");
 * const todos = await client.todos.get();
 *
 * @param baseUrl The base URL of the API
 * @param options Optional configuration, including a custom fetch implementation.
 * @returns A Proxy that intercepts property accesses to build request paths.
 */
export function createClient<TApp extends ServeXRouter>(
	baseUrl: string,
	options?: ClientOptions,
): Client<TApp> {
	const customFetch = options?.fetch ?? globalThis.fetch;

	return build<TApp>(baseUrl, customFetch, [], options);
}

function build<TApp extends ServeXRouter>(
	baseUrl: string,
	customFetch: FetchLike,
	segments: string[],
	options?: ClientOptions,
) {
	const target = { __path: segments };

	return new Proxy(target, {
		get(target, prop) {
			if (prop === "__path") return target.__path;
			if (typeof prop === "symbol") return undefined;

			const methodName =
				prop.toLowerCase() as (typeof SUPPORTED_METHODS)[number];

			// Terminal HTTP method access
			if (!SUPPORTED_METHODS.includes(methodName)) {
				const newSegments = [...target.__path, prop];
				return build(baseUrl, customFetch, newSegments);
			}
			return async (reqOptions: RequestOptions = {}) => {
				const fetchUrl = buildClientUrl(baseUrl, target.__path, reqOptions);
				const init = buildRequestInit(methodName, reqOptions);

				// Construct a Request object so it works directly with `app.fetch` or global `fetch`
				let req = new Request(fetchUrl, init as RequestInit);

				const onRequest = reqOptions.onRequest ?? options?.onRequest;
				if (onRequest) {
					req = await onRequest(req);
				}

				let res = await (
					customFetch as (r: Request) => Promise<Response> | Response
				)(req);

				const onResponse = reqOptions.onResponse ?? options?.onResponse;
				if (onResponse) {
					res = await onResponse(res);
				}

				return parseClientResponse(res);
			};
		},
	}) as unknown as Client<TApp>;
}
