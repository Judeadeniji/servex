/**
 * @module adapter/web-standard/handler
 *
 * Web-standard response mappers.
 *
 * **Key difference from bun/handler:** Uses `Response.json((x), ...)`
 * with explicit `content-type` headers instead of `Response.json()`.
 * This ensures standards-compliant behavior on runtimes where `Response.json`
 * is unavailable or behaves differently (Cloudflare Workers, Deno, Node.js).
 *
 * Ported from Elysia `src/adapter/web-standard/handler.ts` and trimmed to
 * remove Elysia-specific types.
 */

import { HttpException } from "../../errors";
import {
	createResponseHandler,
	createStreamHandler,
	handleFile,
	handleSet,
	type ResponseSet,
} from "../utils";

const JSON_CONTENT_TYPE = "application/json";
const TEXT_CONTENT_TYPE = "text/plain";

// ─── mapResponse ─────────────────────────────────────────────────────────────

/**
 * Maps any handler return value to a complete `Response`.
 * Applies `set` (status, headers, cookies) when the response set is non-default.
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
				if (!(set.headers as Record<string, string>)["content-type"])
					(set.headers as Record<string, string>)["content-type"] =
						TEXT_CONTENT_TYPE;
				return new Response(response as string, set as ResponseInit);

			case "Array":
			case "Object":
				if (!(set.headers as Record<string, string>)["content-type"])
					(set.headers as Record<string, string>)["content-type"] =
						JSON_CONTENT_TYPE;
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
				if (response instanceof Response)
					return handleResponse(response, set, request);

				if (response instanceof Promise)
					return response.then((x) =>
						mapResponse(x, set),
					);

				if (response instanceof Error)
					return errorToResponse(response, set);

				if (
					typeof (response as any)?.next === "function" ||
					response instanceof ReadableStream
				)
					return handleStream(
						response as AsyncGenerator,
						set,
						request,
					);

				if (typeof (response as Promise<unknown>)?.then === "function")
					return (response as Promise<unknown>).then((x) =>
						mapResponse(x, set),
					);

				if (Array.isArray(response))
					return Response.json(response, {
						headers: { "Content-Type": JSON_CONTENT_TYPE },
					});

				if (response instanceof HttpException)
					return mapResponse(response.getResponse(), set);

				if ("charCodeAt" in (response as Record<string, unknown>)) {
					const code = (
						response as { charCodeAt(i: number): number }
					).charCodeAt(0);
					if (code === 123 || code === 91) {
						if (!(set.headers as Record<string, string>)["Content-Type"])
							(set.headers as Record<string, string>)["Content-Type"] =
								JSON_CONTENT_TYPE;
						return Response.json(response);
					}
				}

				return new Response(response as BodyInit, set as ResponseInit);
		}
	}

	if (
		typeof (response as any)?.next === "function" ||
		response instanceof ReadableStream
	)
		return handleStream(
			response as AsyncGenerator,
			set,
			request,
		);

	return mapCompactResponse(response, request);
};

// ─── mapEarlyResponse ─────────────────────────────────────────────────────────

/**
 * Maps any truthy handler return value to a `Response | undefined`.
 * Returns `undefined` when response is null/undefined (chain continues).
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
				if (!(set.headers as Record<string, string>)["content-type"])
					(set.headers as Record<string, string>)["content-type"] =
						TEXT_CONTENT_TYPE;
				return new Response(response as string, set as ResponseInit);

			case "Array":
			case "Object":
				if (!(set.headers as Record<string, string>)["content-type"])
					(set.headers as Record<string, string>)["content-type"] =
						JSON_CONTENT_TYPE;
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
					return response.then((x) =>
						mapEarlyResponse(x, set),
					);

				if (response instanceof Error)
					return errorToResponse(response, set);

				if (
					typeof (response as any)?.next === "function" ||
					response instanceof ReadableStream
				)
					return handleStream(
						response as AsyncGenerator,
						set,
						request,
					);

				if (typeof (response as Promise<unknown>)?.then === "function")
					return (response as Promise<unknown>).then((x) =>
						mapEarlyResponse(x, set),
					);

				if (typeof (response as any)?.toResponse === "function")
					return mapEarlyResponse((response as any).toResponse(), set);

				if (Array.isArray(response))
					return Response.json(response, {
						headers: { "Content-Type": JSON_CONTENT_TYPE },
					});

				if ("charCodeAt" in (response as Record<string, unknown>)) {
					const code = (
						response as { charCodeAt(i: number): number }
					).charCodeAt(0);
					if (code === 123 || code === 91) {
						if (!(set.headers as Record<string, string>)["Content-Type"])
							(set.headers as Record<string, string>)["Content-Type"] =
								JSON_CONTENT_TYPE;
						return Response.json(response);
					}
				}

				return new Response(response as BodyInit, set as ResponseInit);
		}
	} else {
		// Fast path: no set mutation.
		switch (response?.constructor?.name) {
			case "String":
				return new Response(response as string, {
					headers: { "Content-Type": TEXT_CONTENT_TYPE },
				});

			case "Array":
			case "Object":
				return Response.json(response, {
					headers: { "content-type": JSON_CONTENT_TYPE },
					...(set as ResponseInit),
				});

			case "File":
			case "Blob":
				return handleFile(response as File | Blob, set, request);

			case undefined:
				if (!response) return new Response("");
				return Response.json(response, {
					headers: { "content-type": JSON_CONTENT_TYPE },
				});

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
					return response.then((x) =>
						mapEarlyResponse(x, set),
					);

				if (response instanceof Error)
					return errorToResponse(response, set);

				if (
					typeof (response as any)?.next === "function" ||
					response instanceof ReadableStream
				)
					return handleStream(
						response as AsyncGenerator,
						set,
						request,
					);

				if (typeof (response as Promise<unknown>)?.then === "function")
					return (response as Promise<unknown>).then((x) =>
						mapEarlyResponse(x, set),
					);

				if (typeof (response as any)?.toResponse === "function")
					return mapEarlyResponse((response as any).toResponse(), set);

				if (Array.isArray(response))
					return Response.json(response, {
						headers: { "Content-Type": JSON_CONTENT_TYPE },
					});

				if ("charCodeAt" in (response as Record<string, unknown>)) {
					const code = (
						response as { charCodeAt(i: number): number }
					).charCodeAt(0);
					if (code === 123 || code === 91) {
						if (!(set.headers as Record<string, string>)["Content-Type"])
							(set.headers as Record<string, string>)["Content-Type"] =
								JSON_CONTENT_TYPE;
						return Response.json(response);
					}
				}

				return new Response(response as BodyInit);
		}
	}
};

// ─── mapCompactResponse ───────────────────────────────────────────────────────

/**
 * Maps a handler return value to a `Response` without applying any `set`
 * overrides — the fastest code path.
 */
export const mapCompactResponse = (
	response: unknown,
	request?: Request,
): Response | Promise<Response> => {
	switch (response?.constructor?.name) {
		case "String":
			return new Response(response as string, {
				headers: { "Content-Type": TEXT_CONTENT_TYPE },
			});

		case "Object":
		case "Array":
			return Response.json(response, {
				headers: { "Content-Type": JSON_CONTENT_TYPE },
			});

		case "File":
		case "Blob":
			return handleFile(response as File | Blob, undefined, request);

		case undefined:
			if (!response) return new Response("");
			return Response.json(response, {
				headers: { "content-type": JSON_CONTENT_TYPE },
			});

		case "Response":
			return response as Response;

		case "Error":
			return errorToResponse(response as Error);

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
				return response.then((x) =>
					mapCompactResponse(x, request),
				);

			if (response instanceof Error)
				return errorToResponse(response);

			if (
				typeof (response as any)?.next === "function" ||
				response instanceof ReadableStream
			)
				return handleStream(
					response as AsyncGenerator,
					undefined,
					request,
				);

			if (typeof (response as Promise<unknown>)?.then === "function")
				return (response as Promise<unknown>).then((x) =>
					mapCompactResponse(x, request),
				);

			if (typeof (response as any)?.toResponse === "function")
				return mapCompactResponse((response as any).toResponse());

			if (Array.isArray(response))
				return Response.json(response, {
					headers: { "Content-Type": JSON_CONTENT_TYPE },
				});

			if ("charCodeAt" in (response as Record<string, unknown>)) {
				const code = (response as { charCodeAt(i: number): number }).charCodeAt(
					0,
				);
				if (code === 123 || code === 91)
					return Response.json(response, {
						headers: { "Content-Type": JSON_CONTENT_TYPE },
					});
			}

			return new Response(response as BodyInit);
	}
};

export const errorToResponse = (
	error: Error & { toResponse?(): Response | Promise<Response> },
	set?: ResponseSet,
): Response | Promise<Response> => {
	if (typeof error?.toResponse === "function") {
		const raw = error.toResponse();
		const targetSet = set ?? ({ headers: {}, status: 200 } as ResponseSet);

		const apply = (resolved: unknown) => {
			if (resolved instanceof Response) targetSet.status = resolved.status;
			return mapResponse(resolved, targetSet);
		};

		return typeof (raw as any)?.then === "function"
			? (raw as Promise<Response>).then(apply)
			: apply(raw);
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

function isNotEmpty(obj: Record<string, unknown> | Headers | undefined): boolean {
	if (!obj) return false;
	if (obj instanceof Headers) {
		for (const _ of obj.keys()) return true;
		return false;
	}
	for (const _ in obj) return true;
	return false;
}
