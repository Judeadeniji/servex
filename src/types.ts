import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Context } from "./context";
import type { HttpException } from "./http-exception";
import type { StatusCode } from "./http-status";
import type {
	ValidationTarget,
	ValidatorMiddleware,
} from "./middlewares/validator";
import type { RouterType } from "./router/adapter";
import type { AbsolutePath, ExtractUrl } from "./router/types";

// ── Environment ───────────────────────────────────────────────────────────────

type Bindings = object;
type Variables = object;

export type Env = Partial<{
	Bindings: Bindings;
	Variables: Variables;
}>;

// ── Core Handler Types ────────────────────────────────────────────────────────

export type NextFunction = () => Promise<Response | void>;

export type Handler<C extends Context = Context, R = Response> = (
	ctx: C,
	next: NextFunction,
) => Promise<R | void> | R | void;

/** Alias kept for clarity at middleware registration sites. */
export type MiddlewareHandler<C extends Context = Context> = Handler<C>;

export type InlineHandler =
	| string
	| number
	| boolean
	| Record<string, unknown>
	| Response;

export type InternalHandler<C extends Context = Context, R = Response> =
	| Handler<C, R>
	| InlineHandler;

// ── Hook Types ────────────────────────────────────────────────────────────────

/** Lifecycle hook — no response argument (onRequest, onBeforeHandle, onResponse). */
export type HookHandler<C extends Context = Context> = (
	ctx: C,
) => void | Promise<void> | Response | Promise<Response>;

/** Lifecycle hook with the outgoing response (onAfterHandle). */
export type AfterHandleHook<C extends Context = Context> = (
	ctx: C,
	response: Response,
) => void | Promise<void> | Response | Promise<Response>;

/** Lifecycle hook for errors (onError). */
export type ErrorHook<C extends Context = Context> = (
	error: HttpException | Error,
	ctx: C,
) => void | Promise<void> | Response | Promise<Response>;

// ── Trace Types ───────────────────────────────────────────────────────────────

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

// ── Hooks Aggregate ───────────────────────────────────────────────────────────

export interface Hooks<E extends Env = Env> {
	onRequest: HookHandler<Context<E>>[];
	onBeforeHandle: HookHandler<Context<E>>[];
	onAfterHandle: AfterHandleHook<Context<E>>[];
	onError: ErrorHook<Context<E>>[];
	onResponse: HookHandler<Context<E>>[];
	trace: ((api: TraceAPI<Context<E>>) => void | Promise<void>)[];
}

// ── Route / ServerRoute ───────────────────────────────────────────────────────

export type ServerRoute<E extends Env = Env> = {
	method: Method;
	path: string;
	handlers: InternalHandler<Context<E>>[];
};

// ── Utility Types ─────────────────────────────────────────────────────────────

export type ExtractResponseType<T> = T extends (
	...args: unknown[]
) => infer R | Promise<infer R>
	? R
	: never;

export type Last<T extends unknown[]> = T extends readonly [...unknown[], infer L]
	? L
	: never;

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

export declare function fetch(request: Request): Promise<Response>;

export type { Context };

// ── Server Options ────────────────────────────────────────────────────────────

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
	 * Enable Just-In-Time (JIT) compilation of handler chains.
	 * If true, handler chains are compiled into highly optimized synchronous fast-paths using new Function().
	 * If false, it falls back to the native recursive loop execution (useful for Cloudflare Workers where new Function() is blocked).
	 * Default: true
	 */
	jit?: boolean;
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

// ── Plugin ────────────────────────────────────────────────────────────────────

export interface ServeXPlugin<PluginSchema = {}> {
	name: string;
	setup<E extends Env, S, B extends string>(
		app: ServeXRouter<E, S, B>,
		prefix: string,
	): ServeXRouter<E, S & PluginSchema, B>;
}

// ── ServeXRouter ──────────────────────────────────────────────────────────────

/**
 * The schema entry produced by a single validated route registration.
 * @internal
 */
type ValidatedRouteSchema<
	M extends string,
	T extends ValidationTarget,
	Schema extends StandardSchemaV1,
	R,
	IsStatic extends boolean = false,
> = {
	[K in M]: {
		req: { [K in T]: StandardSchemaV1.InferInput<Schema> };
		res: R;
	};
} & (IsStatic extends true ? { IS_STATIC: true } : {});

/**
 * The context type for a validated route handler.
 * @internal
 */
type ValidatedContext<
	E extends Env,
	P extends string,
	T extends ValidationTarget,
	Schema extends StandardSchemaV1,
> = Context<E, P, ExtractUrl<P>, { [K in T]: StandardSchemaV1.InferOutput<Schema> }>;

/**
 * Narrows the schema produced by a plain (non-validated) route.
 * `R extends InlineHandler` → IS_STATIC is set; otherwise just { [M]: R }.
 * @internal
 */
type PlainRouteSchema<M extends string, R> = R extends InlineHandler
	? { [K in M]: R } & { IS_STATIC: true }
	: { [K in M]: R };

/**
 * The return type of every method registration — merges the new route entry
 * into the accumulated schema `S`.
 * @internal
 */
type AddRoute<
	E extends Env,
	S,
	B extends string,
	P extends string,
	Entry,
> = ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: Entry }, B>;

export interface ServeXRouter<
	E extends Env = Env,
	S = {},
	B extends string = "/",
> {
	onResponse(handler: HookHandler<Context<E>>): this;
	trace(handler: (api: TraceAPI<Context<E>>) => void | Promise<void>): this;

	use<PluginSchema>(
		plugin: ServeXPlugin<PluginSchema>,
	): ServeXRouter<E, S & PluginSchema, B>;

	use<P extends string, PluginSchema>(
		path: P,
		plugin: ServeXPlugin<PluginSchema>,
	): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: PluginSchema }, B>;

	use(
		path: string | MiddlewareHandler<Context>,
		...middlewares: MiddlewareHandler<Context>[]
	): this;

	// ── GET ───────────────────────────────────────────────────────────────────

	get<P extends string, T extends ValidationTarget, Schema extends StandardSchemaV1>(
		path: P,
		validator: ValidatorMiddleware<T, Schema>,
		handler: InlineHandler,
	): AddRoute<E, S, B, P, ValidatedRouteSchema<"GET", T, Schema, InlineHandler, true>>;

	get<P extends string, T extends ValidationTarget, Schema extends StandardSchemaV1, R>(
		path: P,
		validator: ValidatorMiddleware<T, Schema>,
		handler: Handler<ValidatedContext<E, P, T, Schema>, R>,
	): AddRoute<E, S, B, P, ValidatedRouteSchema<"GET", T, Schema, R>>;

	get<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"GET", R>>;

	get<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { GET: R }>;

	// ── POST ──────────────────────────────────────────────────────────────────

	post<P extends string, T extends ValidationTarget, Schema extends StandardSchemaV1>(
		path: P,
		validator: ValidatorMiddleware<T, Schema>,
		handler: InlineHandler,
	): AddRoute<E, S, B, P, ValidatedRouteSchema<"POST", T, Schema, InlineHandler, true>>;

	post<P extends string, T extends ValidationTarget, Schema extends StandardSchemaV1, R>(
		path: P,
		validator: ValidatorMiddleware<T, Schema>,
		handler: Handler<ValidatedContext<E, P, T, Schema>, R>,
	): AddRoute<E, S, B, P, ValidatedRouteSchema<"POST", T, Schema, R>>;

	post<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"POST", R>>;

	post<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { POST: R }>;

	// ── PUT ───────────────────────────────────────────────────────────────────

	put<P extends string, T extends ValidationTarget, Schema extends StandardSchemaV1>(
		path: P,
		validator: ValidatorMiddleware<T, Schema>,
		handler: InlineHandler,
	): AddRoute<E, S, B, P, ValidatedRouteSchema<"PUT", T, Schema, InlineHandler, true>>;

	put<P extends string, T extends ValidationTarget, Schema extends StandardSchemaV1, R>(
		path: P,
		validator: ValidatorMiddleware<T, Schema>,
		handler: Handler<ValidatedContext<E, P, T, Schema>, R>,
	): AddRoute<E, S, B, P, ValidatedRouteSchema<"PUT", T, Schema, R>>;

	put<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"PUT", R>>;

	put<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { PUT: R }>;

	// ── DELETE ────────────────────────────────────────────────────────────────

	delete<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"DELETE", R>>;

	delete<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { DELETE: R }>;

	// ── PATCH ─────────────────────────────────────────────────────────────────

	patch<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"PATCH", R>>;

	patch<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { PATCH: R }>;

	// ── OPTIONS ───────────────────────────────────────────────────────────────

	options<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"OPTIONS", R>>;

	options<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { OPTIONS: R }>;

	// ── HEAD ──────────────────────────────────────────────────────────────────

	head<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"HEAD", R>>;

	head<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { HEAD: R }>;

	// ── ALL ───────────────────────────────────────────────────────────────────

	all<P extends string, R extends InlineHandler>(
		path: P,
		...args: [...Handler[], R]
	): AddRoute<E, S, B, P, PlainRouteSchema<"ALL", R>>;

	all<P extends string, R>(
		path: P,
		...args: [...Handler[], Handler<Context<E, P>, R>]
	): AddRoute<E, S, B, P, { ALL: R }>;

	// ── Subrouting ────────────────────────────────────────────────────────────

	route<P extends string, ChildSchema = {}>(
		path: P,
		fn: (
			r: ServeXRouter<E, {}, AbsolutePath<B, P>>,
		) => ServeXRouter<E, ChildSchema, AbsolutePath<B, P>> | undefined,
	): ServeXRouter<E, S & ChildSchema, B>;

	route<
		P extends string,
		ChildSchema = {},
		ChildEnv extends Env = Env,
		ChildBasePath extends string = string,
	>(
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
		[K in keyof S as K extends `${string}:${string}` | `${string}*${string}`
			? never
			: S[K] extends { GET: unknown; IS_STATIC: true }
				? K
				: never]: S[K] extends { GET: infer R }
			? R extends Response
				? R
				: Response & TypedResponse<R, 200>
			: Response;
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
