import * as ck from "./cookie";
import {
	background,
	type Context as SignalContext,
	withCancel,
} from "./core/signal";
import type { StatusCode } from "./http-status";
import type { ExtractUrl } from "./router/types";
import type { Env, HeaderRecord, JSONValue } from "./types";

/**
 * An extended Fetch Request object used by ServeX.
 * Adds performance-optimized body parsing utilities directly to the request.
 */
export interface ServeXRequest extends Request {
	/**
	 * Parses and returns the request body as JSON.
	 *
	 * @template T Expected return type of the parsed JSON
	 * @returns A promise that resolves to the parsed JSON
	 */
	json<T = JSONValue>(): Promise<T>;
}

/**
 * Lightweight internal representation of the parsed request context.
 * @internal
 */
export type RequestContext = {
	params: Record<string, string>;
};

/**
 * ServeX Context
 *
 * The central request/response object in ServeX. It provides access to the request,
 * environment, variables, and utility methods for sending responses (json, text, html)
 * in an optimized, flat struct designed for maximum V8 performance.
 *
 * @template E Type of the environment variables/bindings.
 * @template P The route path pattern.
 * @template I The inferred parameter types from the route.
 */
export interface Context<
	E extends Env = Env,
	P extends string = "/",
	I extends Record<string, unknown> = ExtractUrl<P>,
	ValidData extends Record<string, any> = {},
> {
	/**
	 * Internal storage for validated data.
	 * @internal
	 */
	_validData?: ValidData;

	/**
	 * Retrieve validated data from the specified target.
	 * @param target The part of the request that was validated ("body", "query", or "params")
	 */
	valid<T extends keyof ValidData>(target: T): ValidData[T];
	/**
	 * The incoming Fetch Request object.
	 * Extended with lightweight methods like `.json()` for parsing the body.
	 */
	req: ServeXRequest;
	/**
	 * Environment bindings.
	 * Gives access to Cloudflare Workers KV, D1, environment variables, etc.
	 */
	env: E["Bindings"];
	/**
	 * The underlying execution context.
	 * Useful for calling methods like `ctx.waitUntil()` in serverless environments.
	 */
	executionCtx?: unknown;
	/**
	 * Indicates if debug mode is active.
	 * Disables certain performance warnings when true.
	 */
	debug: boolean;

	/** @internal */
	deferred?: Array<() => Promise<unknown> | unknown>;
	/** @internal */
	finalResponse?: Response;

	/** @internal */
	_params: Record<string, string>;
	/** @internal */
	_query?: URLSearchParams;
	/** @internal */
	_body?: unknown;
	/** @internal */
	_response?: Response;
	/** @internal */
	_headers?: Headers;
	/** @internal */
	_status: StatusCode;
	/** @internal */
	_variables?: Map<string, unknown>;
	/** @internal */
	_isFinished: boolean;
	/** @internal */
	_routine?: SignalContext;

	/** @internal */
	markFinished(): void;

	/**
	 * Defers the execution of a task until after the response has been sent to the client.
	 * Useful for logging, analytics, or background processing without delaying the response.
	 *
	 * @param task The function to execute later.
	 */
	defer(task: () => Promise<unknown> | unknown): void;

	/**
	 * Gets the current request-scoped cancellation/timeout signal routine.
	 * @returns The active signal context for managing timeouts and cancellations.
	 */
	routine(): SignalContext;

	/**
	 * Sets a new request-scoped cancellation/timeout signal routine.
	 * @param ctx The new signal context to apply.
	 */
	setRoutine(ctx: SignalContext): void;

	/**
	 * Sets one or more response headers.
	 *
	 * @example
	 * c.setHeaders({ "Cache-Control": "max-age=3600" });
	 *
	 * @param headers A record of header names and their string or array of string values.
	 * @returns This Context instance for chaining.
	 */
	setHeaders(headers: { [key: string]: string | string[] }): this;

	/**
	 * Sets a single response cookie.
	 *
	 * @example
	 * c.setCookie("session", "xyz123", { secure: true, httpOnly: true });
	 *
	 * @param name The name of the cookie.
	 * @param value The value of the cookie.
	 * @param options Additional serialization options (e.g., maxAge, path).
	 * @returns This Context instance for chaining.
	 */
	setCookie(
		name: string,
		value: string,
		options?: ck.CookieSerializeOptions,
	): this;

	/**
	 * Sets multiple response cookies.
	 *
	 * @example
	 * c.setCookies({ session: "xyz", pref: "dark" }, { httpOnly: true });
	 *
	 * @param cookies A record mapping cookie names to values.
	 * @param options Additional serialization options applied to all provided cookies.
	 * @returns This Context instance for chaining.
	 */
	setCookies(
		cookies: Record<string, string>,
		options?: ck.CookieSerializeOptions,
	): this;

	/**
	 * Constructs the final Fetch Response object, resolving all set headers and cookies.
	 * @returns The standard Response object.
	 */
	res(): Response;

	/**
	 * Gets the current mutable Response Headers object.
	 * @returns The Headers instance for the outgoing response.
	 */
	header(): Headers;

	/**
	 * Retrieves all matched route parameters as an object.
	 * @returns A record containing all route parameters.
	 */
	params(): Record<string, string>;
	/**
	 * Retrieves a specific matched route parameter by its defined key.
	 *
	 * @example
	 * // Given route /users/:id
	 * const id = c.params("id");
	 *
	 * @param k The name of the parameter.
	 * @returns The parameter value as a string.
	 */
	params<K extends keyof I["params"]>(k: K): string;
	params(k: string): string | undefined;

	/** @internal */
	setParams(params: Record<string, string>): this;

	/**
	 * Stores a value in the request-scoped variables map.
	 * Useful for passing data downstream through middleware.
	 *
	 * @param key The variable key.
	 * @param value The value to store.
	 */
	set<Key extends keyof E["Variables"]>(
		key: Key,
		value: E["Variables"][Key],
	): void;
	set(key: string, value: unknown): void;

	/**
	 * Retrieves a value from the request-scoped variables map.
	 *
	 * @param key The variable key.
	 * @returns The previously stored value.
	 */
	get<Key extends keyof E["Variables"]>(key: Key): E["Variables"][Key];
	get<T>(key: string): T;

	/**
	 * Gets all parsed URL query parameters as a URLSearchParams object.
	 * @returns The URLSearchParams parsed from the request URL.
	 */
	query(): URLSearchParams;
	/**
	 * Gets the first value of a specific query parameter.
	 *
	 * @example
	 * // Given URL /search?q=test
	 * const q = c.query("q"); // "test"
	 *
	 * @param q The query parameter key.
	 * @returns The value of the parameter, or null if it doesn't exist.
	 */
	query(q: string): string | null;

	/**
	 * Gets all query parameters as a record of arrays (useful for multiple values per key).
	 * @returns An object where keys map to arrays of their string values.
	 */
	queries(): Record<string, string[]>;
	/**
	 * Gets all values of a specific query parameter.
	 *
	 * @example
	 * // Given URL /filter?tag=news&tag=sports
	 * const tags = c.queries("tag"); // ["news", "sports"]
	 *
	 * @param q The query parameter key.
	 * @returns An array of string values, or null if it doesn't exist.
	 */
	queries(q: string): string[] | null;

	/**
	 * Parses and retrieves the request body as FormData.
	 * @returns A promise that resolves to the parsed FormData.
	 */
	formData(): Promise<FormData>;

	/**
	 * Parses and retrieves the request body as URLSearchParams.
	 * @returns A promise that resolves to the parsed URLSearchParams.
	 */
	urlEncoded(): Promise<URLSearchParams>;

	/**
	 * Sends a JSON response.
	 * Automatically sets the `Content-Type: application/json` header.
	 *
	 * @example
	 * return c.json({ user: "alice" });
	 *
	 * @param object The object to stringify and send.
	 * @param status The HTTP status code (defaults to 200).
	 * @param _headers Additional headers to include in the response.
	 * @returns A typed Response object.
	 */
	json<T extends JSONValue, U extends StatusCode = 200>(
		object: T,
		status?: U,
		_headers?: HeaderRecord,
	): Response & import("./types").TypedResponse<T, U, "json">;

	/**
	 * Sends a plain text response.
	 * Automatically sets the `Content-Type: text/plain` header.
	 *
	 * @example
	 * return c.text("Hello World!");
	 *
	 * @param text The string to send.
	 * @param status The HTTP status code (defaults to 200).
	 * @param _headers Additional headers to include in the response.
	 * @returns A typed Response object.
	 */
	text<T extends string, U extends StatusCode = 200>(
		text: T,
		status?: U,
		_headers?: HeaderRecord,
	): Response & import("./types").TypedResponse<T, U, "text">;

	/**
	 * Sends an HTML response.
	 * Automatically sets the `Content-Type: text/html` header.
	 *
	 * @example
	 * return c.html("<h1>Welcome</h1>");
	 *
	 * @param html The HTML string to send.
	 * @param status The HTTP status code (defaults to 200).
	 * @param _headers Additional headers to include in the response.
	 * @returns A typed Response object.
	 */
	html<T extends string, U extends StatusCode = StatusCode>(
		html: T,
		status?: U,
		_headers?: HeaderRecord,
	): Response & import("./types").TypedResponse<T, U, "html">;

	/**
	 * Sends a redirect response to the specified location.
	 *
	 * @example
	 * return c.redirect("/login", 302);
	 *
	 * @param location The URL to redirect to.
	 * @param status The HTTP redirect status code (defaults to 302).
	 * @returns A Response object representing the redirect.
	 */
	redirect(location: string, status?: StatusCode): Response;

	/**
	 * Sends a ReadableStream response.
	 *
	 * @example
	 * return c.stream(readableFileStream);
	 *
	 * @param stream The stream to pipe to the response body.
	 * @param status The HTTP status code (defaults to 200).
	 * @param _headers Additional headers to include in the response.
	 * @returns A Response object representing the stream.
	 */
	stream(
		stream: ReadableStream,
		status?: StatusCode,
		_headers?: HeaderRecord,
	): Response;

	/**
	 * Gets the current response status code.
	 * @returns The HTTP status code that will be returned if no other status is provided.
	 */
	status(): StatusCode;
}

const _warnIfFinished = function (this: Context, method: string) {
	if (this._isFinished && !this.debug) {
		console.warn(
			`[ServeX] Warning: Attempted to call Context.${method}() after the response was already sent!`,
		);
	}
};

const contextHelpers = {
	markFinished(this: Context) {
		this._isFinished = true;
	},

	defer(this: Context, task: () => Promise<unknown> | unknown) {
		if (!this.deferred) this.deferred = [];
		this.deferred.push(task);
	},

	routine(this: Context) {
		if (!this._routine) {
			const [routine, cancel] = withCancel(background());
			this._routine = routine;
			if (!this.req.signal) this.routine();
			if (this.req.signal.aborted) {
				cancel();
			} else {
				this.req.signal.addEventListener("abort", () => cancel(), {
					once: true,
				});
			}
		}
		return this._routine;
	},

	setRoutine(this: Context, ctx: SignalContext) {
		this._routine = ctx;
	},

	setHeaders(this: Context, headers: { [key: string]: string | string[] }) {
		_warnIfFinished.call(this, "setHeaders");
		for (const name in headers) {
			if (Object.hasOwn(headers, name)) {
				const value = headers[name];
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						this.header().append(name, value[i]);
					}
				} else {
					this.header().set(name, value);
				}
			}
		}
		return this;
	},

	setCookie(
		this: Context,
		name: string,
		value: string,
		options?: ck.CookieSerializeOptions,
	) {
		_warnIfFinished.call(this, "setCookie");
		const ckStr = ck.serialize(name, value, options);
		this.header().append("Set-Cookie", ckStr);
		return this;
	},

	setCookies(
		this: Context,
		cookies: Record<string, string>,
		options?: ck.CookieSerializeOptions,
	) {
		for (const [name, value] of Object.entries(cookies)) {
			this.setCookie(name, value, options);
		}
		return this;
	},

	res(this: Context) {
		if (!this._response) {
			this._response = new Response(null, { headers: this._headers });
		}
		return this._response;
	},

	header(this: Context) {
		if (!this._headers) {
			this._headers = new Headers();
		}
		return this._headers;
	},

	params(this: Context, k?: string) {
		return typeof k === "string" ? this._params[k] : this._params;
	},

	setParams(this: Context, params: Record<string, string>) {
		this._params = params;
		return this;
	},

	set(this: Context, key: string, value: unknown) {
		if (!this._variables) this._variables = new Map();
		this._variables.set(key, value);
	},

	get(this: Context, key: string) {
		return this._variables?.get(key);
	},

	query(this: Context, q?: string) {
		if (!this._query) {
			const searchIndex = this.req.url.indexOf("?");
			if (searchIndex !== -1) {
				this._query = new URLSearchParams(this.req.url.slice(searchIndex));
			} else {
				this._query = new URLSearchParams();
			}
		}
		return q ? this._query.get(q) : this._query;
	},

	queries(this: Context, q?: string) {
		if (!this._query) {
			this.query(); // ensure parsed
		}
		if (q) {
			const all = (this._query as URLSearchParams).getAll(q);
			return all.length > 0 ? all : null;
		}

		const result: Record<string, string[]> = {};
		for (const [key, value] of (this._query as URLSearchParams).entries()) {
			if (!result[key]) {
				result[key] = [];
			}
			result[key].push(value);
		}
		return result;
	},

	async formData(this: Context) {
		if (this._body === undefined) {
			this._body = await this.req.formData();
		}
		return this._body as FormData;
	},

	async urlEncoded(this: Context) {
		if (this._body === undefined) {
			const text = await this.req.text();
			this._body = new URLSearchParams(text);
		}
		return this._body as URLSearchParams;
	},

	json(
		this: Context,
		object: JSONValue,
		status?: StatusCode,
		_headers?: HeaderRecord,
	) {
		_warnIfFinished.call(this, "json");
		const body = JSON.stringify(object);
		this._status = status ?? 200;

		if (!this._headers && !_headers && !this._response) {
			this._response = new Response(body, {
				status: this._status,
				headers: { "Content-Type": "application/json; charset=UTF-8" },
			});
			return this._response;
		}

		const headers = this._headers || new Headers();
		headers.set("Content-Type", "application/json; charset=UTF-8");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this._response = new Response(body, { status: this._status, headers });
		return this._response;
	},

	text(
		this: Context,
		text: string,
		status?: StatusCode,
		_headers?: HeaderRecord,
	) {
		_warnIfFinished.call(this, "text");
		this._status = status ?? 200;

		if (!this._headers && !_headers && !this._response) {
			this._response = new Response(text, {
				status: this._status,
				headers: { "Content-Type": "text/plain; charset=UTF-8" },
			});
			return this._response;
		}

		const headers = this._headers || new Headers();
		headers.set("Content-Type", "text/plain; charset=UTF-8");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this._response = new Response(text, { status: this._status, headers });
		return this._response;
	},

	html(
		this: Context,
		html: string,
		status?: StatusCode,
		_headers?: HeaderRecord,
	) {
		_warnIfFinished.call(this, "html");
		this._status = status ?? 200;

		if (!this._headers && !_headers && !this._response) {
			this._response = new Response(html, {
				status: this._status,
				headers: { "Content-Type": "text/html; charset=UTF-8" },
			});
			return this._response;
		}

		const headers = this._headers || new Headers();
		headers.set("Content-Type", "text/html; charset=UTF-8");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this._response = new Response(html, { status: this._status, headers });
		return this._response;
	},

	redirect(this: Context, location: string, status: StatusCode = 302) {
		_warnIfFinished.call(this, "redirect");
		this._status = status;

		if (!this._headers && !this._response) {
			this._response = new Response(null, {
				status: this._status,
				headers: { Location: location },
			});
			return this._response;
		}

		const headers = this._headers || new Headers();
		headers.set("Location", location);

		this._response = new Response(null, { status: this._status, headers });
		return this._response;
	},

	stream(
		this: Context,
		stream: ReadableStream,
		status?: StatusCode,
		_headers?: HeaderRecord,
	) {
		_warnIfFinished.call(this, "stream");
		this._status = status ?? 200;

		if (!this._headers && !_headers && !this._response) {
			this._response = new Response(stream, {
				status: this._status,
				headers: {
					"Content-Type": "text/plain; charset=UTF-8",
					"Transfer-Encoding": "chunked",
				},
			});
			return this._response;
		}

		const headers = this._headers || new Headers();
		headers.set("Content-Type", "text/plain; charset=UTF-8");
		headers.set("Transfer-Encoding", "chunked");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this._response = new Response(stream, { status: this._status, headers });
		return this._response;
	},

	status(this: Context) {
		return this._status;
	},

	valid<T extends "body" | "query" | "params">(this: Context, target: T): any {
		if (!this._validData) {
			throw new Error(
				"No validation data found. Did you forget to apply the validator middleware?",
			);
		}
		if (!(target in this._validData)) {
			throw new Error(`No validation data found for target: ${target}`);
		}
		return this._validData[target as keyof typeof this._validData];
	},
};

/**
 * Factory function to create a new ServeX Context.
 * Uses `__proto__` injection to attach methods without the overhead of class instantiation,
 * ensuring monomorphic inline caches for V8.
 *
 * @internal
 * @param request The incoming Fetch Request.
 * @param env Environment variables and bindings.
 * @param params Matched route parameters.
 * @param executionCtx The underlying execution context (e.g. from Cloudflare Workers).
 * @param debug Whether debug mode is active.
 * @returns An optimized Context instance.
 */
export function createContext(
	request: Request,
	env: Record<string, unknown>,
	params: Record<string, string>,
	executionCtx?: unknown,
	debug: boolean = false,
) {
	const ctx = {
		__proto__: contextHelpers,
		req: request as ServeXRequest,
		env,
		executionCtx,
		debug,
		deferred: undefined,
		finalResponse: undefined,
		_params: params || {},
		_query: undefined,
		_body: undefined,
		_response: undefined,
		_headers: undefined,
		_status: 200,
		_variables: undefined,
		_isFinished: false,
		_routine: undefined,
		_validData: undefined,
	} as unknown as Context;
	return ctx;
}
