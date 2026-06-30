/**
 * @module adapter/bun/handler
 *
 * Bun-optimized response mappers.
 *
 * **Key difference from web-standard:** `Response.json(x)` is used instead of
 * `new Response(JSON.stringify(x), {headers:{'content-type':'application/json'}})`.
 * In Bun this is measurably faster because `Response.json` avoids an extra
 * string allocation and header object construction in native code.
 *
 * @see https://x.com/jarredsumner/status/2023328556210921948
 *
 * Ported from Elysia `src/adapter/bun/handler.ts` and trimmed to remove
 * Elysia-specific types (`ElysiaFile`, `ElysiaCustomStatusResponse`, `Cookie`).
 * Those can be added back as ServeX gains equivalent constructs.
 */

import type { HttpException } from "../../errors";
import {
	createResponseHandler,
	createStreamHandler,
	handleFile,
	handleSet,
	type ResponseSet,
} from "../utils";

// ─── mapResponse ─────────────────────────────────────────────────────────────

/**
 * Maps any handler return value to a complete `Response`.
 * Applies `set` (status, headers, cookies) when the response set is non-default.
 *
 * Call this when the handler **must** produce a response (final handler in
 * the chain, or the only handler).
 */
export const mapResponse = (
	response: unknown,
	set: ResponseSet,
	request?: Request,
): Response | Promise<Response> => {
	if (isNotEmpty(set.headers) || set.status !== 200 || set.cookie) {
		handleSet(set);

		switch (response?.constructor?.name) {
			case "String":
				return new Response(response as string, set as ResponseInit);

			case "Array":
			case "Object":
				return Response.json(response, set as ResponseInit);

			case "File":
			case "Blob":
				return handleFile(response as File | Blob, set, request);

			case undefined:
				if (!response) return new Response("", set as ResponseInit);
				return Response.json(response, set as ResponseInit);

			case "Response":
				return handleResponse(response as Response, set, request);

			case "Error":
				return errorToResponse(response as Error, set);

			case "Promise":
				return (response as Promise<unknown>).then((x) =>
					mapResponse(x, set, request),
				);

			case "Function":
				return mapResponse((response as () => unknown)(), set, request);

			case "Number":
			case "Boolean":
				return new Response(
					String(response as number | boolean),
					set as ResponseInit,
				);

			case "FormData":
				return new Response(response as FormData, set as ResponseInit);

			default:
				// Fallback instanceof checks for subclassed / extended types.
				if (response instanceof Response)
					return handleResponse(response, set, request);

				if (response instanceof Promise)
					return response.then((x) => mapResponse(x, set));

				if (response instanceof Error) return errorToResponse(response, set);

				if (
					typeof (response as any)?.next === "function" ||
					response instanceof ReadableStream
				)
					return handleStream(response as AsyncGenerator, set, request);

				if (typeof (response as Promise<unknown>)?.then === "function")
					return (response as Promise<unknown>).then((x) =>
						mapResponse(x, set),
					);

				// Custom class with array-like value (e.g. Bun.sql`` result)
				if (Array.isArray(response)) return Response.json(response);

				if (typeof (response as any)?.toResponse === "function")
					return mapResponse((response as any).toResponse(), set);

				if ("charCodeAt" in (response as Record<string, unknown>)) {
					const code = (
						response as { charCodeAt(i: number): number }
					).charCodeAt(0);
					if (code === 123 || code === 91)
						return Response.json(response, set as ResponseInit);
				}

				return new Response(response as BodyInit, set as ResponseInit);
		}
	}

	// Stream response defers 'set' changes — handle unconditionally.
	if (
		typeof (response as any)?.next === "function" ||
		response instanceof ReadableStream
	)
		return handleStream(response as AsyncGenerator, set, request);

	return mapCompactResponse(response, request);
};

// ─── mapEarlyResponse ─────────────────────────────────────────────────────────

/**
 * Maps any truthy handler return value to a `Response`, or `undefined` if the
 * response is null/undefined (signalling "keep going down the chain").
 *
 * Use this for lifecycle hooks that may optionally return a response.
 */
export const mapEarlyResponse = (
	response: unknown,
	set: ResponseSet,
	request?: Request,
): Response | undefined | Promise<Response | undefined> => {
	if (response === undefined || response === null) return;

	if (isNotEmpty(set.headers) || set.status !== 200 || set.cookie) {
		handleSet(set);

		switch (response?.constructor?.name) {
			case "String":
				return new Response(response as string, set as ResponseInit);

			case "Array":
			case "Object":
				return Response.json(response, set as ResponseInit);

			case "File":
			case "Blob":
				return handleFile(response as File | Blob, set, request);

			case undefined:
				if (!response) return;
				return Response.json(response, set as ResponseInit);

			case "Response":
				return handleResponse(response as Response, set, request);

			case "Promise":
				return (response as Promise<unknown>).then((x) =>
					mapEarlyResponse(x, set),
				);

			case "Error":
				return errorToResponse(response as Error, set);

			case "Function":
				return mapEarlyResponse((response as () => unknown)(), set);

			case "Number":
			case "Boolean":
				return new Response(
					String(response as number | boolean),
					set as ResponseInit,
				);

			case "FormData":
				return new Response(response as FormData, set as ResponseInit);

			default:
				if (response instanceof Response)
					return handleResponse(response, set, request);

				if (response instanceof Promise)
					return response.then((x) => mapEarlyResponse(x, set));

				if (response instanceof Error) return errorToResponse(response, set);

				if (
					typeof (response as any)?.next === "function" ||
					response instanceof ReadableStream
				)
					return handleStream(response as AsyncGenerator, set, request);

				if (typeof (response as Promise<unknown>)?.then === "function")
					return (response as Promise<unknown>).then((x) =>
						mapEarlyResponse(x, set),
					);

				if (typeof (response as any)?.toResponse === "function")
					return mapEarlyResponse((response as any).toResponse(), set);

				if (Array.isArray(response)) return Response.json(response);

				if ("charCodeAt" in (response as Record<string, unknown>)) {
					const code = (
						response as { charCodeAt(i: number): number }
					).charCodeAt(0);
					if (code === 123 || code === 91)
						return Response.json(response, set as ResponseInit);
				}

				return new Response(response as BodyInit, set as ResponseInit);
		}
	} else {
		// No set mutation needed — fast path.
		switch (response?.constructor?.name) {
			case "String":
				return new Response(response as string);

			case "Array":
			case "Object":
				return Response.json(response, set as ResponseInit);

			case "File":
			case "Blob":
				return handleFile(response as File | Blob, set, request);

			case undefined:
				if (!response) return new Response("");
				return Response.json(response);

			case "Response":
				return response as Response;

			case "Promise":
				return (response as Promise<unknown>).then((x) => {
					const r = mapEarlyResponse(x, set);
					if (r !== undefined) return r;
				});

			case "Error":
				return errorToResponse(response as Error, set);

			case "Function":
				return mapCompactResponse((response as () => unknown)(), request);

			case "Number":
			case "Boolean":
				return new Response(String(response as number | boolean));

			case "FormData":
				return new Response(response as FormData);

			default:
				if (response instanceof Response) return response;

				if (response instanceof Promise)
					return response.then((x) => mapEarlyResponse(x, set));

				if (response instanceof Error) return errorToResponse(response, set);

				if (
					typeof (response as any)?.next === "function" ||
					response instanceof ReadableStream
				)
					return handleStream(response as AsyncGenerator, set, request);

				if (typeof (response as Promise<unknown>)?.then === "function")
					return (response as Promise<unknown>).then((x) =>
						mapEarlyResponse(x, set),
					);

				if (typeof (response as any)?.toResponse === "function")
					return mapEarlyResponse((response as any).toResponse(), set);

				if (Array.isArray(response)) return Response.json(response);

				if ("charCodeAt" in (response as Record<string, unknown>)) {
					const code = (
						response as { charCodeAt(i: number): number }
					).charCodeAt(0);
					if (code === 123 || code === 91)
						return Response.json(response, set as ResponseInit);
				}

				return new Response(response as BodyInit);
		}
	}
};

// ─── mapCompactResponse ───────────────────────────────────────────────────────

/**
 * Maps a handler return value to a `Response` **without** applying any `set`
 * headers or status — used when neither cookies nor custom headers are present.
 *
 * This is the fastest code path.
 */
export const mapCompactResponse = (
	response: unknown,
	request?: Request,
): Response | Promise<Response> => {
	switch (response?.constructor?.name) {
		case "String":
			return new Response(response as string);

		case "Object":
		case "Array":
			return Response.json(response);

		case "File":
		case "Blob":
			return handleFile(response as File | Blob, undefined, request);

		case undefined:
			if (!response) return new Response("");
			return Response.json(response);

		case "Response":
			return response as Response;

		case "Error":
			return errorToResponse(response as Error) as Response;

		case "Promise":
			return (response as Promise<unknown>).then((x) =>
				mapCompactResponse(x, request),
			);

		case "Function":
			return mapCompactResponse((response as () => unknown)(), request);

		case "Number":
		case "Boolean":
			return new Response(String(response as number | boolean));

		case "FormData":
			return new Response(response as FormData);

		default:
			if (response instanceof Response) return response;

			if (response instanceof Promise)
				return response.then((x) => mapCompactResponse(x, request));

			if (response instanceof Error) return errorToResponse(response);

			if (
				typeof (response as any)?.next === "function" ||
				response instanceof ReadableStream
			)
				return handleStream(response as AsyncGenerator, undefined, request);

			if (typeof (response as Promise<unknown>)?.then === "function")
				return (response as Promise<unknown>).then((x) =>
					mapCompactResponse(x, request),
				);

			if (typeof (response as any)?.toResponse === "function")
				return mapCompactResponse((response as any).toResponse());

			if (Array.isArray(response)) return Response.json(response);

			if ("charCodeAt" in (response as Record<string, unknown>)) {
				const code = (response as { charCodeAt(i: number): number }).charCodeAt(
					0,
				);
				if (code === 123 || code === 91) return Response.json(response);
			}

			return new Response(response as BodyInit);
	}
};

// ─── errorToResponse ──────────────────────────────────────────────────────────

/**
 * Converts an `Error` into a JSON `Response`.
 * If the error has a `.toResponse()` method, that is used instead.
 */
export const errorToResponse = (
	error: Error,
	set?: ResponseSet,
): Response | Promise<Response> => {
	if (typeof (error as HttpException)?.getResponse === "function") {
		const raw = (error as HttpException).getResponse();
		const targetSet = set ?? { headers: {}, status: 200 };

		const apply = (resolved: unknown) => {
			if (resolved instanceof Response) targetSet.status = resolved.status;
			return mapResponse(resolved, targetSet);
		};

		return apply(raw);
	}

	return Response.json(
		{
			name: error?.name,
			message: error?.message,
			cause: error?.cause,
		},
		{
			status: set?.status !== 200 ? ((set?.status as number) ?? 500) : 500,
			headers: set?.headers as HeadersInit,
		},
	);
};

// ─── createStaticHandler ──────────────────────────────────────────────────────

/**
 * Pre-compiles a static return value (string, object, number, etc.) into a
 * reusable `() => Response` factory that clones the pre-built response on
 * every request.
 *
 * Returns `undefined` when hooks are present (because hooks may mutate the
 * response) or when `handle` is a function (which must be called at runtime).
 */
export const createStaticHandler = (
	handle: unknown,
	hooks?: {
		parse?: unknown[];
		transform?: unknown[];
		beforeHandle?: unknown[];
		afterHandle?: unknown[];
	},
	setHeaders: ResponseSet["headers"] = {},
): (() => Response) | undefined => {
	if (typeof handle === "function") return;

	const response = mapResponse(handle, { headers: setHeaders, status: 200 });
	if (response instanceof Promise) return;

	if (
		!hooks?.parse?.length &&
		!hooks?.transform?.length &&
		!hooks?.beforeHandle?.length &&
		!hooks?.afterHandle?.length
	)
		return () => response.clone();
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

const handleResponse = createResponseHandler({
	mapResponse,
	mapCompactResponse,
});
const handleStream = createStreamHandler({ mapResponse, mapCompactResponse });

function isNotEmpty(
	obj: Record<string, unknown> | Headers | undefined,
): boolean {
	if (!obj) return false;
	if (obj instanceof Headers) {
		for (const _ of obj.keys()) return true;
		return false;
	}
	for (const _ in obj) return true;
	return false;
}
