import * as ck from "./cookie";
import {
	background,
	type Context as SignalContext,
	withCancel,
} from "./core/signal";
import type { StatusCode } from "./http-status";
import type { ExtractUrl } from "./router/types";
import type { Env, HeaderRecord, JSONValue } from "./types";

interface ServeXRequest extends Request {
	json<T = JSONValue>(): Promise<T>;
}

type RequestContext = {
	params: Record<string, string>;
};

export class Context<
	E extends Env = Env,
	P extends string = "/",
	I extends Record<string, unknown> = ExtractUrl<P>,
> {
	#rawRequest: ServeXRequest;
	#env: E["Bindings"];
	#params: Record<string, string>;
	#query?: URLSearchParams;
	#body: unknown;
	#response?: Response;
	#headers?: Headers;
	#status: StatusCode = 200;
	#variables?: Map<string, unknown>;
	debug = false;

	#routine?: SignalContext;
	executionCtx?: unknown;
	deferred?: Array<() => Promise<unknown> | unknown>;
	finalResponse?: Response;

	constructor(
		request: Request,
		env: E["Bindings"],
		ctx: RequestContext,
		executionCtx?: unknown,
		debug: boolean = false,
	) {
		this.#rawRequest = request as ServeXRequest;
		this.#env = env;
		this.#params = ctx?.params || {};
		this.executionCtx = executionCtx;
		this.debug = debug;
	}

	/**
	 * Defer a background task to run after the response has been sent to the client.
	 * On Cloudflare Workers/Edge, this automatically maps to `executionCtx.waitUntil()`.
	 */
	defer(task: () => Promise<unknown> | unknown) {
		if (!this.deferred) this.deferred = [];
		this.deferred.push(task);
	}

	get routine() {
		if (!this.#routine) {
			const [routine, cancel] = withCancel(background());
			this.#routine = routine;
			if (!this.#rawRequest.signal) this.routine;
			if (this.#rawRequest.signal.aborted) {
				cancel();
			} else {
				this.#rawRequest.signal.addEventListener("abort", () => cancel(), {
					once: true,
				});
			}
		}
		return this.#routine;
	}

	set routine(ctx: SignalContext) {
		this.#routine = ctx;
	}

	setHeaders(headers: { [key: string]: string | string[] }) {
		for (const name in headers) {
			if (Object.hasOwn(headers, name)) {
				const value = headers[name];
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						this.header.append(name, value[i]);
					}
				} else {
					this.header.set(name, value);
				}
			}
		}
		return this;
	}

	setCookie(name: string, value: string, options?: ck.CookieSerializeOptions) {
		const ckStr = ck.serialize(name, value, options);
		this.header.append("Set-Cookie", ckStr);
		return this;
	}

	setCookies(
		cookies: Record<string, string>,
		options?: ck.CookieSerializeOptions,
	) {
		for (const [name, value] of Object.entries(cookies)) {
			this.setCookie(name, value, options);
		}

		return this;
	}

	/**
	 * The original Request object.
	 */
	get req() {
		return this.#rawRequest;
	}

	get res() {
		if (!this.#response) {
			this.#response = new Response(null, { headers: this.#headers });
		}
		return this.#response;
	}

	get header() {
		if (!this.#headers) {
			this.#headers = new Headers();
		}
		return this.#headers;
	}

	/**
	 * Environment bindings (e.g., variables, secrets).
	 */
	get env(): E["Bindings"] {
		return this.#env;
	}

	/**
	 * Route parameters extracted from the URL.
	 * @example
	 * // URL: /heroes/spiderman
	 * // params: { heroName: "spiderman" }
	 */
	params(): Record<string, string>;
	params<K extends keyof I["params"]>(k: K): string;
	params(k: string): string | undefined;
	params(
		k?: string | keyof I["params"],
	): Record<string, string> | string | undefined {
		return typeof k === "string" ? this.#params[k as string] : this.#params;
	}

	setParams(params: Record<string, string>) {
		this.#params = params;
		return this;
	}

	/**
	 * Set a variable in the context state. Useful for sharing typed data across middlewares.
	 */
	set<Key extends keyof E["Variables"]>(
		key: Key,
		value: E["Variables"][Key],
	): void;
	set(key: string, value: unknown): void;
	set(key: string, value: unknown): void {
		if (!this.#variables) this.#variables = new Map();
		this.#variables.set(key, value);
	}

	/**
	 * Get a variable from the context state.
	 */
	get<Key extends keyof E["Variables"]>(key: Key): E["Variables"][Key];
	get<T>(key: string): T;
	get(key: string): unknown {
		return this.#variables?.get(key);
	}

	/**
	 * Query parameters extracted from the URL.
	 * @example
	 * // URL: /search?q=spiderman
	 * // query: URLSearchParams("q=spiderman")
	 */
	query(): URLSearchParams;
	query(q: string): string | null;
	query(q?: string): string | null | URLSearchParams {
		if (!this.#query) {
			const searchIndex = this.#rawRequest.url.indexOf("?");
			if (searchIndex !== -1) {
				this.#query = new URLSearchParams(
					this.#rawRequest.url.slice(searchIndex),
				);
			} else {
				this.#query = new URLSearchParams();
			}
		}
		return q ? this.#query.get(q) : this.#query;
	}

	/**
	 * Retrieves all values for a given query parameter or all query parameters as a record.
	 * @example
	 * // URL: /search?tags=action&tags=comedy
	 * // c.queries("tags") => ["action", "comedy"]
	 * // c.queries() => { tags: ["action", "comedy"] }
	 */
	queries(): Record<string, string[]>;
	queries(q: string): string[] | null;
	queries(q?: string): string[] | null | Record<string, string[]> {
		if (!this.#query) {
			this.query(); // ensure parsed
		}
		if (q) {
			const all = (this.#query as URLSearchParams).getAll(q);
			return all.length > 0 ? all : null;
		}

		const result: Record<string, string[]> = {};
		for (const [key, value] of (this.#query as URLSearchParams).entries()) {
			if (!result[key]) {
				result[key] = [];
			}
			result[key].push(value);
		}
		return result;
	}

	/**
	 * Parses and returns the request body as form data.
	 */
	async formData(): Promise<FormData> {
		if (this.#body === undefined) {
			this.#body = await this.#rawRequest.formData();
		}
		return this.#body as FormData;
	}

	/**
	 * Parses and returns the request body as URL-encoded data.
	 */
	async urlEncoded(): Promise<URLSearchParams> {
		if (this.#body === undefined) {
			const text = await this.#rawRequest.text();
			this.#body = new URLSearchParams(text);
		}
		return this.#body as URLSearchParams;
	}

	/**
	 * Constructs and returns a JSON response.
	 * @param object - The JSON-serializable object to return.
	 * @param status - Optional HTTP status code (default: 200).
	 * @param headers - Optional headers to include in the response.
	 */
	json<T extends JSONValue, U extends StatusCode = 200>(
		object: T,
		status?: U,
		_headers?: HeaderRecord,
	): Response & import("./types").TypedResponse<T, U, "json"> {
		const body = JSON.stringify(object);
		this.#status = status ?? 200;

		if (!this.#headers && !_headers && !this.#response) {
			this.#response = new Response(body, {
				status: this.#status,
				headers: { "Content-Type": "application/json; charset=UTF-8" },
			});
			return this.#response as never;
		}

		const headers = this.#headers || new Headers();
		headers.set("Content-Type", "application/json; charset=UTF-8");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this.#response = new Response(body, { status: this.#status, headers });
		return this.#response as never;
	}

	/**
	 * Constructs and returns a text response.
	 * @param text - The text to return.
	 * @param status - Optional HTTP status code (default: 200).
	 * @param headers - Optional headers to include in the response.
	 */
	text<T extends string, U extends StatusCode = 200>(
		text: T,
		status?: U,
		_headers?: HeaderRecord,
	): Response & import("./types").TypedResponse<T, U, "text"> {
		this.#status = status ?? 200;

		if (!this.#headers && !_headers && !this.#response) {
			this.#response = new Response(text, {
				status: this.#status,
				headers: { "Content-Type": "text/plain; charset=UTF-8" },
			});
			return this.#response as never;
		}

		const headers = this.#headers || new Headers();
		headers.set("Content-Type", "text/plain; charset=UTF-8");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this.#response = new Response(text, { status: this.#status, headers });
		return this.#response as never;
	}

	/**
	 * Constructs and returns an HTML response.
	 * @param html - The HTML string to return.
	 * @param status - Optional HTTP status code (default: 200).
	 * @param headers - Optional headers to include in the response.
	 */
	html<T extends string, U extends StatusCode = StatusCode>(
		html: T,
		status?: U,
		_headers?: HeaderRecord,
	): Response & import("./types").TypedResponse<T, U, "html"> {
		this.#status = status ?? 200;

		if (!this.#headers && !_headers && !this.#response) {
			this.#response = new Response(html, {
				status: this.#status,
				headers: { "Content-Type": "text/html; charset=UTF-8" },
			});
			return this.#response as never;
		}

		const headers = this.#headers || new Headers();
		headers.set("Content-Type", "text/html; charset=UTF-8");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this.#response = new Response(html, { status: this.#status, headers });
		return this.#response as never;
	}

	/**
	 * Constructs and returns a redirect response.
	 * @param location - The URL to redirect to.
	 * @param status - Optional HTTP status code (default: 302).
	 */
	redirect(location: string, status: StatusCode = 302): Response {
		this.#status = status;

		if (!this.#headers && !this.#response) {
			this.#response = new Response(null, {
				status: this.#status,
				headers: { Location: location },
			});
			return this.#response;
		}

		const headers = this.#headers || new Headers();
		headers.set("Location", location);

		this.#response = new Response(null, { status: this.#status, headers });
		return this.#response;
	}

	/**
	 * Constructs and returns a streaming response.
	 * @param stream - The ReadableStream to return.
	 * @param status - Optional HTTP status code (default: 200).
	 * @param headers - Optional headers to include in the response.
	 */
	stream(
		stream: ReadableStream,
		status?: StatusCode,
		_headers?: HeaderRecord,
	): Response {
		this.#status = status ?? 200;

		if (!this.#headers && !_headers && !this.#response) {
			this.#response = new Response(stream, {
				status: this.#status,
				headers: {
					"Content-Type": "text/plain; charset=UTF-8",
					"Transfer-Encoding": "chunked",
				},
			});
			return this.#response;
		}

		const headers = this.#headers || new Headers();
		headers.set("Content-Type", "text/plain; charset=UTF-8");
		headers.set("Transfer-Encoding", "chunked");
		if (_headers) {
			for (const key in _headers) {
				const val = _headers[key];
				headers.set(key, Array.isArray(val) ? val.join(",") : val);
			}
		}

		this.#response = new Response(stream, { status: this.#status, headers });
		return this.#response;
	}

	get status() {
		return this.#status;
	}
}
