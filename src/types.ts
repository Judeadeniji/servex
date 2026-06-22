import { Context } from "./context";
import type { HttpException } from "./http-exception";
import type { StatusCode } from "./http-status";
import type { RouterType } from "./router/adapter";
import type { AbsolutePath } from "./router/types";

type Bindings = object;
type Variables = object;

export type Env = Partial<{
	Bindings: Bindings;
	Variables: Variables;
}>;

export type ServerRoute<E extends Env = Env> = {
	method: Method; // Added HTTP method
	path: string;
	data: Handler<Context<E>>[];
};

export type Handler<C extends Context = Context> = (
	ctx: C,
	next: NextFunction,
// biome-ignore lint/suspicious/noConfusingVoidType: handlers can return void
) => Promise<Response | void> | Response | void;

export type RequestHandler<C extends Context = Context> = (
	ctx: C,
	next: NextFunction,
// biome-ignore lint/suspicious/noConfusingVoidType: handlers can return void
) => Promise<Response | void> | Response | void;

export type MiddlewareHandler<C extends Context> = Handler<C>;

export interface ServerOptions<B extends string = "/"> {
	router?: RouterType;
	middlewares?: MiddlewareHandler<Context>[];
	/**
	 * A common URL prefix that is stripped from every incoming request's
	 * pathname before routing. Useful when the app is mounted at a sub-path
	 * (e.g. behind a reverse-proxy or in a sub-directory).
	 *
	 * The literal type of this value is captured as the `B` type parameter on
	 * the returned app, making fully-qualified route paths available to RPC
	 * clients via the schema type `S`.
	 *
	 * @example
	 * const app = createServer({ basePath: "/api/v1" });
	 * //    ^? ServeXApp<Env, {}, "/api/v1">
	 * app.get("/users", handler);
	 * //       schema S becomes { "/api/v1/users": { GET: ... } }
	 */
	basePath?: B;
	/**
	 * Enable Ahead-Of-Time (AOT) / Just-In-Time (JIT) compilation of handler chains.
	 * If true, handler chains are compiled into highly optimized synchronous fast-paths.
	 * If false, it falls back to the native recursive loop execution.
	 * Default: true
	 */
	aot?: boolean;
	/**
	 * Enable debug mode. If true, full stack traces will be returned in 500 error responses,
	 * and the `context.debug` flag will be set to true for use in middlewares.
	 * Default: false
	 */
	debug?: boolean;
	/**
	 * Enable native static response bypassing for inline values.
	 * If true, routes defined with inline values (e.g. app.get('/version', 1)) 
	 * without middlewares will be injected into Bun.serve.static for maximum performance.
	 * Default: false
	 */
	nativeStaticResponse?: boolean;
}

export type InlineHandler = string | number | boolean | Record<string, unknown> | Response;

export type HookHandler<C extends Context> = (
	ctx: C,
) => void | Promise<void> | Response | Promise<Response>;
export type AfterHandleHook<C extends Context> = (
	ctx: C,
	response: Response,
) => void | Promise<void> | Response | Promise<Response>;
export type ErrorHook<C extends Context> = (
	error: HttpException | Error,
	ctx: C,
) => void | Promise<void> | Response | Promise<Response>;

export interface TraceEventInfo {
	begin: number;
	end: number;
	error?: Error | null;
}

export interface TraceEvent {
	begin: number;
	onStop: (callback: (info: TraceEventInfo) => void | Promise<void>) => void;
}

export type TraceListener = (event: TraceEvent) => void | Promise<void>;

export interface TraceAPI<C extends Context = Context> {
	context: C;
	onRequest(listener: TraceListener): void;
	onBeforeHandle(listener: TraceListener): void;
	onHandle(listener: TraceListener): void;
	onAfterHandle(listener: TraceListener): void;
	onError(listener: TraceListener): void;
	onResponse(listener: TraceListener): void;
}

export interface Hooks<E extends Env = Env> {
	onRequest: HookHandler<Context<E>>[];
	onBeforeHandle: HookHandler<Context<E>>[];
	onAfterHandle: AfterHandleHook<Context<E>>[];
	onError: ErrorHook<Context<E>>[];
	onResponse: HookHandler<Context<E>>[];
	trace: ((api: TraceAPI<Context<E>>) => void | Promise<void>)[];
}

export type ExtractResponseType<T> = T extends (
	...args: unknown[]
) => infer R | Promise<infer R>
	? R
	: never;
export type Last<T extends unknown[]> = T extends readonly [...unknown[], infer L]
	? L
	: never;

export interface ServeXRouter<
	E extends Env = Env,
	// biome-ignore lint/complexity/noBannedTypes: schema requires empty object
	S = {},
	B extends string = "/",
> {
	onResponse(handler: HookHandler<Context<E>>): this;
	trace(handler: (api: TraceAPI<Context<E>>) => void | Promise<void>): this;

	use(
		path: string | MiddlewareHandler<Context>,
		...middlewares: MiddlewareHandler<Context>[]
	): this;

	get<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
	get<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
	get<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
	get<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
	get<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
	get<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
	get<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;

	post<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
	post<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
	post<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
	post<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
	post<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
	post<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
	post<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;

	put<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
	put<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
	put<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
	put<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
	put<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
	put<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
	put<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;

	delete<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
	delete<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
	delete<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
	delete<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
	delete<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
	delete<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
	delete<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;

	patch<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
	patch<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
	patch<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
	patch<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
	patch<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
	patch<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
	patch<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;

	options<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
	options<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
	options<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
	options<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
	options<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
	options<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
	options<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;

	head<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
	head<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
	head<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
	head<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
	head<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
	head<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
	head<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;

	all<P extends string, R extends InlineHandler>(
		path: P,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
	all<P extends string, R>(
		path: P,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
	all<P extends string, R>(
		path: P,
		m1: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
	all<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
	all<P extends string, R>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
	all<P extends string, R extends InlineHandler>(
		path: P,
		m1: Handler,
		m2: Handler,
		handler: R,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
	all<P extends string, R>(
		path: P,
		...handlers: (Handler | InlineHandler)[]
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;

	// biome-ignore lint/complexity/noBannedTypes: schema requires empty object
	route<P extends string, ChildSchema = {}>(
		path: P,
		fn: (
			// biome-ignore lint/complexity/noBannedTypes: empty schema requires {}
			r: ServeXRouter<E, {}, AbsolutePath<B, P>>,
		) => ServeXRouter<E, ChildSchema, AbsolutePath<B, P>> | undefined,
	): ServeXRouter<E, S & ChildSchema, B>;
	// biome-ignore lint/complexity/noBannedTypes: schema requires empty object
	route<P extends string, ChildSchema = {}, ChildEnv extends Env = Env, ChildBasePath extends string = string>(
		path: P,
		app: ServeXRouter<ChildEnv, ChildSchema, ChildBasePath>,
	): ServeXRouter<E, S & ChildSchema, B>;

	/**
	 * Mount a WinterTC-compliant fetch function to a specific path.
	 * This allows interoperability with frameworks like Hono, Remix, Itty Router, etc.
	 *
	 * @example
	 * const hono = new Hono().get("/", (c) => c.text("Hono!"));
	 * app.mount("/hono", hono.fetch);
	 */
	mount<P extends string>(
		path: P,
		fetchFn: (
			request: Request,
			env?: unknown,
			ctx?: unknown,
		) => Response | Promise<Response>,
	): ServeXRouter<E, S, B>;

	/** Array of all registered routes in this router */
	readonly routes: ServerRoute[];

	/**
	 * Natively injected static responses (if nativeStaticResponse is enabled).
	 * Strictly typed with all known route paths.
	 */
	static?: Record<string, Response> & { 
		[K in keyof S]?: S[K] extends { GET: infer R }
			? R extends Response ? R : Response & TypedResponse<R, 200>
			: Response
	};

	/**
	 * Handle an incoming `Request` — compatible with Cloudflare Workers, Bun,
	 * and Deno. Always present on the chained type so it can be referenced after
	 * any number of `.get().post()…` calls without a type cast.
	 */
	fetch(
		request: Request,
		env?: unknown,
		ctx?: unknown,
	): Response | Promise<Response>;

	/**
	 * Convenience wrapper: constructs a `Request` from `input` and delegates to
	 * `fetch`. Useful in tests and server-side `request()` calls.
	 */
	request(input: RequestInfo, init?: RequestInit): Response | Promise<Response>;
}

// http methods
export type Method =
	| "ALL"
	| "GET"
	| "POST"
	| "PUT"
	| "DELETE"
	| "PATCH"
	| "OPTIONS"
	| "HEAD";

// Headers Record
export type HeaderRecord = Record<string, string | string[]>;

// Body Response Types
export type Data = string | ArrayBuffer | Blob | ReadableStream;

// Helper Types for Setting and Getting Headers
export type SetHeaders = (
	name: string,
	value: string | undefined,
	options?: { append?: boolean },
) => void;
export type GetHeaders = (name: string) => string | null;

// Placeholder for JSON Values
export type JSONValue =
	| string
	| number
	| boolean
	| null
	| JSONValue[]
	| { [key: string]: JSONValue };

// Renderer Type (for HTML rendering)
export type Renderer = (...args: unknown[]) => Response | Promise<Response>;

export type KnownResponseFormat = "json" | "text" | "redirect";
export type ResponseFormat = KnownResponseFormat | string;

export type TypedResponse<
	T = unknown,
	U extends StatusCode = StatusCode,
	F extends ResponseFormat = T extends string
		? "text"
		: T extends JSONValue
			? "json"
			: ResponseFormat,
> = {
	_data: T;
	_status: U;
	_format: F;
};

// biome-ignore lint/suspicious/noConfusingVoidType: allow void for handlers
export type NextFunction = () => Promise<Response | void>;
export declare function fetch(request: Request): Promise<Response>;

export { Context };
