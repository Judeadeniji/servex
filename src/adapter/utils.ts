/**
 * @module adapter/utils
 *
 * Shared response-mapping utilities used by all ServeX adapters.
 *
 * Ported from Elysia's `src/adapter/utils.ts` and trimmed to remove
 * Elysia-specific dependencies (`serializeCookie`, `StatusMap`, etc.) while
 * preserving all performance-critical patterns:
 *
 * - Range-request support for File / Blob responses
 * - Safe multi-value `set-cookie` header merging
 * - SSE / Generator / ReadableStream → streaming `Response`
 * - Chunked-transfer detection for proxied `Response` bodies
 */

// ─── ResponseSet ─────────────────────────────────────────────────────────────

/**
 * The minimal shape of `Context['set']` expected by every adapter helper.
 * Kept here so the adapter layer does not need to import the full Context type.
 */
export interface ResponseSet {
	headers: Record<string, string | string[]> | Headers;
	status: number | string;
	cookie?: Record<string, unknown>;
	redirect?: string;
}

// ─── File / Range ─────────────────────────────────────────────────────────────

/**
 * Serves a `File` or `Blob` with full HTTP range-request support (RFC 7233).
 *
 * Elysia origin: `adapter/utils.ts → handleFile`
 */
export const handleFile = (
	response: File | Blob,
	set?: ResponseSet,
	request?: Request,
): Response => {
	const size = response.size;

	const rangeHeader = request?.headers.get("range");
	if (rangeHeader) {
		const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
		if (match) {
			if (!match[1] && !match[2])
				return new Response(null, {
					status: 416,
					headers: mergeHeaders(
						new Headers({ "content-range": `bytes */${size}` }),
						set?.headers ?? {},
					),
				});

			let start: number;
			let end: number;

			if (!match[1] && match[2]) {
				const suffix = Number.parseInt(match[2], 10);
				start = Math.max(0, size - suffix);
				end = size - 1;
			} else {
				start = match[1] ? Number.parseInt(match[1], 10) : 0;
				end = match[2]
					? Math.min(Number.parseInt(match[2], 10), size - 1)
					: size - 1;
			}

			if (start >= size || start > end) {
				return new Response(null, {
					status: 416,
					headers: mergeHeaders(
						new Headers({ "content-range": `bytes */${size}` }),
						set?.headers ?? {},
					),
				});
			}

			const contentLength = end - start + 1;
			const rangeHeaders = new Headers({
				"accept-ranges": "bytes",
				"content-range": `bytes ${start}-${end}/${size}`,
				"content-length": String(contentLength),
			});

			return new Response(
				(
					response as {
						slice(start: number, end: number, contentType?: string): Blob;
					}
				).slice(start, end + 1, response.type),
				{
					status: 206,
					headers: mergeHeaders(rangeHeaders, set?.headers ?? {}),
				},
			);
		}
	}

	const immutable =
		set &&
		(set.status === 206 ||
			set.status === 304 ||
			set.status === 412 ||
			set.status === 416);

	const defaultHeader = immutable
		? ({} as Record<string, string>)
		: ({
				"accept-ranges": "bytes",
				"content-range": size ? `bytes 0-${size - 1}/${size}` : undefined,
			} as Record<string, string>);

	if (!set && !size) return new Response(response as Blob);

	if (!set)
		return new Response(response as Blob, {
			headers: defaultHeader,
		});

	if (set.headers instanceof Headers) {
		for (const key of Object.keys(defaultHeader))
			if (!set.headers.has(key)) set.headers.set(key, defaultHeader[key]);

		if (immutable) {
			set.headers.delete("content-length");
			set.headers.delete("accept-ranges");
		}

		return new Response(response as Blob, set as ResponseInit);
	}

	if (isNotEmpty(set.headers))
		return new Response(response as Blob, {
			status: set.status as number,
			headers: Object.assign(defaultHeader, set.headers),
		});

	return new Response(response as Blob, {
		status: set.status as number,
		headers: defaultHeader,
	});
};

// ─── Cookie helpers ───────────────────────────────────────────────────────────

/**
 * Re-serialises an array of `set-cookie` values into individual append calls
 * so that Bun / Node / CF Workers all receive correctly separated cookies.
 *
 * Elysia origin: `adapter/utils.ts → parseSetCookies`
 */
export const parseSetCookies = (headers: Headers, setCookie: string[]) => {
	if (!headers) return headers;

	headers.delete("set-cookie");

	for (let i = 0; i < setCookie.length; i++) {
		const index = setCookie[i].indexOf("=");
		headers.append(
			"set-cookie",
			`${setCookie[i].slice(0, index)}=${setCookie[i].slice(index + 1) || ""}`,
		);
	}

	return headers;
};

// ─── handleSet ────────────────────────────────────────────────────────────────

/**
 * Flushes a `ResponseSet` before passing it to `new Response(body, set)`:
 * - Normalises `status` string → number (e.g. `"OK"` → 200).
 * - Serialises any cookie bag into the `set-cookie` header.
 * - Expands array-valued `set-cookie` via `parseSetCookies`.
 *
 * Elysia origin: `adapter/utils.ts → handleSet`
 */
export const handleSet = (set: ResponseSet) => {
	if (typeof set.status === "string") {
		set.status = StatusMap[set.status as keyof typeof StatusMap] ?? 200;
	}

	if (set.cookie && isNotEmpty(set.cookie as Record<string, unknown>)) {
		const cookie = serializeCookieBag(set.cookie as Record<string, unknown>);
		if (cookie) (set.headers as Record<string, string>)["set-cookie"] = cookie;
	}

	if (!(set.headers instanceof Headers) && (set.headers as Record<string, any>)["set-cookie"] && Array.isArray((set.headers as Record<string, any>)["set-cookie"])) {
		set.headers = parseSetCookies(
			new Headers(set.headers as HeadersInit),
			(set.headers as Record<string, any>)["set-cookie"] as string[],
		);
	}
};

// ─── Header / Status merging ──────────────────────────────────────────────────

/**
 * Merges `setHeaders` into a clone of `responseHeaders`.
 * Response headers win for conflicting keys; `set.headers` fill non-conflicting ones.
 * `set-cookie` values are always appended, never overwritten.
 *
 * Elysia origin: `adapter/utils.ts → mergeHeaders`
 */
export function mergeHeaders(
	responseHeaders: Headers,
	setHeaders: ResponseSet["headers"],
): Headers {
	// Clone preserves all headers including multiple set-cookie entries.
	const headers = new Headers(responseHeaders);

	if (setHeaders instanceof Headers) {
		for (const key of setHeaders.keys()) {
			if (key === "set-cookie") {
				for (const cookie of setHeaders.getSetCookie()) {
					headers.append("set-cookie", cookie);
				}
			} else if (!responseHeaders.has(key)) {
				headers.set(key, setHeaders.get(key) ?? "");
			}
		}
	} else {
		for (const key in setHeaders) {
			if (key === "set-cookie") headers.append(key, setHeaders[key] as string);
			else if (!responseHeaders.has(key))
				headers.set(key, setHeaders[key] as string);
		}
	}

	return headers;
}

/**
 * Chooses the authoritative status code.
 * The `Response` status wins unless it is the default 200, in which case
 * `set.status` (which may be a named string) is used.
 *
 * Elysia origin: `adapter/utils.ts → mergeStatus`
 */
export function mergeStatus(
	responseStatus: number,
	setStatus: ResponseSet["status"],
): number {
	if (typeof setStatus === "string")
		setStatus = StatusMap[setStatus as keyof typeof StatusMap] ?? 200;

	if (responseStatus === 200) return setStatus as number;

	return responseStatus;
}

/**
 * Copies headers from a `Response` back into `set` so that the handler
 * chain can observe them. Strips `content-encoding` which would prevent
 * streaming.
 *
 * Elysia origin: `adapter/utils.ts → responseToSetHeaders`
 */
export const responseToSetHeaders = (
	response: Response,
	set?: ResponseSet,
): ResponseSet => {
	if (set?.headers) {
		if (response) {
			for (const [key, value] of response.headers.entries())
				if (!(key in (set.headers as Record<string, unknown>)))
					(set.headers as Record<string, string>)[key] = value;
		}

		if (set.status === 200) set.status = response.status;

		if ((set.headers as Record<string, string | undefined>)["content-encoding"])
			delete (set.headers as Record<string, string | undefined>)[
				"content-encoding"
			];

		return set;
	}

	if (!response) return { headers: {}, status: set?.status ?? 200 };

	const result: ResponseSet = { headers: {}, status: set?.status ?? response.status };

	for (const [key, value] of response.headers.entries()) {
		if (key === "content-encoding") continue;
		(result.headers as Record<string, string>)[key] = value;
	}

	return result;
};

// ─── Streaming ────────────────────────────────────────────────────────────────

interface CreateHandlerParameter {
	mapResponse(response: unknown, set: ResponseSet, request?: Request): Response | Promise<Response>;
	mapCompactResponse(response: unknown, request?: Request): Response | Promise<Response>;
}

/** Enqueue typed binary data. Returns true if the chunk was binary. */
const enqueueBinaryChunk = (
	controller: ReadableStreamDefaultController,
	chunk: unknown,
): boolean => {
	if (chunk instanceof Blob) {
		chunk.arrayBuffer().then((buffer) => {
			controller.enqueue(new Uint8Array(buffer));
		});
		return true;
	}

	if (chunk instanceof Uint8Array) {
		controller.enqueue(chunk);
		return true;
	}

	if (chunk instanceof ArrayBuffer) {
		controller.enqueue(new Uint8Array(chunk));
		return true;
	}

	if (ArrayBuffer.isView(chunk)) {
		controller.enqueue(
			new Uint8Array(
				chunk.buffer as ArrayBuffer,
				chunk.byteOffset,
				chunk.byteLength,
			),
		);
		return true;
	}

	return false;
};

/**
 * Converts a Generator, AsyncGenerator, or ReadableStream into a streaming
 * `Response` with correct headers (`transfer-encoding`, `content-type`,
 * `cache-control`).  Auto-detects SSE format.
 *
 * Elysia origin: `adapter/utils.ts → createStreamHandler`
 */
export const createStreamHandler =
	({ mapResponse, mapCompactResponse }: CreateHandlerParameter) =>
	async (
		generator: Generator | AsyncGenerator | ReadableStream,
		set?: ResponseSet,
		request?: Request,
		skipFormat?: boolean,
	): Promise<Response> => {
		// Peek at the first value for SSE / content-type detection.
		let init = (generator as Generator).next?.() as
			| IteratorResult<unknown>
			| undefined;

		if (set) handleSet(set);
		if (init instanceof Promise) init = await init;

		// If the generator immediately yields a ReadableStream, unwrap it.
		if (init?.value instanceof ReadableStream) {
			generator = init.value;
		} else if (init && (typeof init.done === "undefined" || init.done)) {
			if (set) return mapResponse(init.value, set, request);
			return mapCompactResponse(init.value, request);
		}

		const isSSE =
			!skipFormat &&
			((init?.value as any)?.sse ??
				(generator as any)?.sse ??
				(set?.headers instanceof Headers ? set.headers.get("content-type") : (set?.headers as Record<string, any>)?.["content-type"])
					?.toString()
					.startsWith("text/event-stream"));

		const format = isSSE
			? (data: string) => `data: ${data}\n\n`
			: (data: string) => data;

		const contentType = isSSE
			? "text/event-stream"
			: init?.value && typeof init.value === "object"
				? "application/json"
				: "text/plain";

		if (set?.headers) {
			if (!(set.headers as Record<string, string>)["transfer-encoding"])
				(set.headers as Record<string, string>)["transfer-encoding"] =
					"chunked";
			if (!(set.headers as Record<string, string>)["content-type"])
				(set.headers as Record<string, string>)["content-type"] = contentType;
			if (!(set.headers as Record<string, string>)["cache-control"])
				(set.headers as Record<string, string>)["cache-control"] = "no-cache";
		} else {
			set = {
				status: 200,
				headers: {
					"content-type": contentType,
					"transfer-encoding": "chunked",
					"cache-control": "no-cache",
					connection: "keep-alive",
				},
			};
		}

		const iterator: AsyncIterator<unknown> =
			typeof (generator as AsyncGenerator).next === "function"
				? (generator as AsyncIterator<unknown>)
				: (generator as any)[Symbol.asyncIterator]();

		let end = false;

		return new Response(
			new ReadableStream({
				start(controller) {
					request?.signal?.addEventListener("abort", () => {
						end = true;
						iterator.return?.();
						try {
							controller.close();
						} catch {
							/* already closed */
						}
					});

					if (
						!init ||
						init.value instanceof ReadableStream ||
						init.value === undefined ||
						init.value === null
					)
						return;

					if ((init.value as any).toSSE)
						controller.enqueue((init.value as any).toSSE());
					else if (enqueueBinaryChunk(controller, init.value)) return;
					else if (typeof init.value === "object") {
						try {
							controller.enqueue(format(JSON.stringify(init.value)));
						} catch {
							controller.enqueue(format(String(init.value)));
						}
					} else {
						controller.enqueue(format(String(init.value)));
					}
				},

				async pull(controller) {
					if (end) {
						try {
							controller.close();
						} catch {
							/* already closed */
						}
						return;
					}

					try {
						const { value: chunk, done } = await iterator.next();

						if (done || end) {
							try {
								controller.close();
							} catch {
								/* already closed */
							}
							return;
						}

						if (chunk === undefined || chunk === null) return;

						if ((chunk as any).toSSE)
							controller.enqueue((chunk as any).toSSE());
						else if (enqueueBinaryChunk(controller, chunk)) return;
						else if (typeof chunk === "object") {
							try {
								controller.enqueue(format(JSON.stringify(chunk)));
							} catch {
								controller.enqueue(format(String(chunk)));
							}
						} else {
							controller.enqueue(format(String(chunk)));
						}
					} catch (error) {
						console.warn(error);
						try {
							controller.close();
						} catch {
							/* already closed */
						}
					}
				},

				cancel() {
					end = true;
					iterator.return?.();
				},
			}),
			set as ResponseInit,
		);
	};

/**
 * Async-generator reader for an existing `Response` body — used by
 * `createResponseHandler` when re-streaming a chunked proxied response.
 *
 * Elysia origin: `adapter/utils.ts → streamResponse`
 */
export async function* streamResponse(response: Response) {
	const body = response.body;
	if (!body) return;

	const reader = body.getReader();
	const decoder = new TextDecoder();

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			if (typeof value === "string") yield value;
			else yield decoder.decode(value);
		}
	} finally {
		reader.releaseLock();
	}
}

/**
 * Wraps an existing `Response`, merging `set.headers` and `set.status` into
 * a new `Response`.  If the original response was chunked-transfer-encoded
 * (i.e. streamed), it is re-streamed rather than buffered.
 *
 * Elysia origin: `adapter/utils.ts → createResponseHandler`
 */
export const createResponseHandler = (handler: CreateHandlerParameter) => {
	const handleStream = createStreamHandler(handler);

	return (response: Response, set: ResponseSet, request?: Request) => {
		const newResponse = new Response(response.body, {
			headers: mergeHeaders(response.headers, set.headers),
			status: mergeStatus(response.status, set.status),
		});

		if (
			!newResponse.headers.has("content-length") &&
			newResponse.headers.get("transfer-encoding") === "chunked"
		)
			return handleStream(
				streamResponse(newResponse),
				responseToSetHeaders(newResponse, set),
				request,
				true, // do not auto-format SSE for pre-formatted Response
			);

		return newResponse;
	};
};

// ─── Internal helpers (not exported) ─────────────────────────────────────────

/** Returns true when the object has at least one own enumerable key, or if Headers has keys. */
function isNotEmpty(obj: Record<string, unknown> | Headers | undefined): boolean {
	if (!obj) return false;
	if (obj instanceof Headers) {
		for (const _ of obj.keys()) return true;
		return false;
	}
	for (const _ in obj) return true;
	return false;
}

/**
 * Naïve HTTP status code name → number map for the most common codes.
 * Only used when `set.status` is a string (rare, defensive code path).
 */
const StatusMap: Record<string, number> = {
	Continue: 100,
	"Switching Protocols": 101,
	Processing: 102,
	OK: 200,
	Created: 201,
	Accepted: 202,
	"No Content": 204,
	"Moved Permanently": 301,
	Found: 302,
	"Not Modified": 304,
	"Bad Request": 400,
	Unauthorized: 401,
	Forbidden: 403,
	"Not Found": 404,
	"Method Not Allowed": 405,
	Conflict: 409,
	Gone: 410,
	"Unprocessable Entity": 422,
	"Too Many Requests": 429,
	"Internal Server Error": 500,
	"Bad Gateway": 502,
	"Service Unavailable": 503,
	"Gateway Timeout": 504,
};

/**
 * Minimal cookie serializer — only used when `set.cookie` is non-empty.
 * Full cookie serialisation (Max-Age, SameSite, etc.) is handled by the
 * `cookie` sub-package; this is a last-resort stub for adapters that
 * receive a pre-serialized string cookie bag.
 */
function serializeCookieBag(bag: Record<string, unknown>): string {
	const parts: string[] = [];
	for (const [name, value] of Object.entries(bag)) {
		if (value === undefined || value === null) continue;
		if (typeof value === "object" && "value" in value) {
			// Cookie-class-like: { value, ... }
			const cookieValue = (value as Record<string, unknown>).value;
			if (cookieValue !== undefined && cookieValue !== null)
				parts.push(`${name}=${String(cookieValue)}`);
		} else {
			parts.push(`${name}=${String(value)}`);
		}
	}
	return parts.join("; ");
}
