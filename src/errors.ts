/**
 * @module errors
 *
 * Named HTTP error classes that extend `HttpException`.
 * Each class pre-sets the correct status code so you never need to remember the number.
 *
 * @example
 * ```ts
 * import { NotFoundError, ValidationError } from "servex/errors";
 *
 * app.get("/items/:id", async (c) => {
 *   const item = await db.find(c.params("id"));
 *   if (!item) throw new NotFoundError(`Item ${c.params("id")} not found`);
 *   return c.json(item);
 * });
 * ```
 */

import { HttpException, type HttpExceptionOptions } from "./http-exception";

// ─── Helper ──────────────────────────────────────────────────────────────────

type NamedErrorOptions = Omit<HttpExceptionOptions, "statusCode">;

// ─── 4xx Client Errors ───────────────────────────────────────────────────────

/**
 * **400 Bad Request** — The server cannot process the request due to a client error
 * (e.g., malformed request syntax, invalid parameters).
 */
export class BadRequestError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 400, message, ...options });
		this.name = "BadRequestError";
		Object.setPrototypeOf(this, BadRequestError.prototype);
	}
}

/**
 * **401 Unauthorized** — Authentication is required and has failed or not been provided.
 *
 * Typically accompanied by a `WWW-Authenticate` header.
 */
export class UnauthorizedError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 401, message, ...options });
		this.name = "UnauthorizedError";
		Object.setPrototypeOf(this, UnauthorizedError.prototype);
	}
}

/**
 * **402 Payment Required** — Reserved for future use; often used to signal
 * that payment is needed before accessing the resource.
 */
export class PaymentRequiredError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 402, message, ...options });
		this.name = "PaymentRequiredError";
		Object.setPrototypeOf(this, PaymentRequiredError.prototype);
	}
}

/**
 * **403 Forbidden** — The client is authenticated but does not have permission
 * to access the requested resource.
 */
export class ForbiddenError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 403, message, ...options });
		this.name = "ForbiddenError";
		Object.setPrototypeOf(this, ForbiddenError.prototype);
	}
}

/**
 * **404 Not Found** — The requested resource does not exist on the server.
 */
export class NotFoundError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 404, message, ...options });
		this.name = "NotFoundError";
		Object.setPrototypeOf(this, NotFoundError.prototype);
	}
}

/**
 * **405 Method Not Allowed** — The HTTP method used is not supported for the
 * target resource. Include an `Allow` header listing valid methods.
 */
export class MethodNotAllowedError extends HttpException {
	constructor(
		allowedMethods: string[],
		message?: string,
		options?: NamedErrorOptions,
	) {
		super({
			statusCode: 405,
			message:
				message ?? `Method not allowed. Allowed: ${allowedMethods.join(", ")}`,
			headers: {
				Allow: allowedMethods.join(", "),
				...(options?.headers as Record<string, string> | undefined),
			},
			...options,
		});
		this.name = "MethodNotAllowedError";
		Object.setPrototypeOf(this, MethodNotAllowedError.prototype);
	}
}

/**
 * **406 Not Acceptable** — The server cannot produce a response matching the
 * `Accept` header sent by the client.
 */
export class NotAcceptableError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 406, message, ...options });
		this.name = "NotAcceptableError";
		Object.setPrototypeOf(this, NotAcceptableError.prototype);
	}
}

/**
 * **408 Request Timeout** — The server timed out waiting for the request.
 */
export class RequestTimeoutError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 408, message, ...options });
		this.name = "RequestTimeoutError";
		Object.setPrototypeOf(this, RequestTimeoutError.prototype);
	}
}

/**
 * **409 Conflict** — The request conflicts with the current state of the server
 * (e.g., a duplicate resource).
 */
export class ConflictError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 409, message, ...options });
		this.name = "ConflictError";
		Object.setPrototypeOf(this, ConflictError.prototype);
	}
}

/**
 * **410 Gone** — The resource previously existed but has been permanently removed.
 * Unlike 404, this is permanent and search engines should de-index the URL.
 */
export class GoneError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 410, message, ...options });
		this.name = "GoneError";
		Object.setPrototypeOf(this, GoneError.prototype);
	}
}

/**
 * **413 Content Too Large** — The request body exceeds the server's limits.
 */
export class ContentTooLargeError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 413, message, ...options });
		this.name = "ContentTooLargeError";
		Object.setPrototypeOf(this, ContentTooLargeError.prototype);
	}
}

/**
 * **415 Unsupported Media Type** — The `Content-Type` of the request is not
 * supported by the server.
 */
export class UnsupportedMediaTypeError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 415, message, ...options });
		this.name = "UnsupportedMediaTypeError";
		Object.setPrototypeOf(this, UnsupportedMediaTypeError.prototype);
	}
}

/**
 * **422 Unprocessable Entity** — The request is well-formed but contains semantic
 * errors (e.g., validation failures). Attach `data` to describe individual field errors.
 *
 * @example
 * ```ts
 * throw new ValidationError("Validation failed", {
 *   data: { fields: { email: "must be a valid email" } }
 * });
 * ```
 */
export class ValidationError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({
			statusCode: 422,
			message: message ?? "Validation failed",
			...options,
		});
		this.name = "ValidationError";
		Object.setPrototypeOf(this, ValidationError.prototype);
	}
}

/**
 * **429 Too Many Requests** — The client has sent too many requests in a given
 * timeframe. Use a `Retry-After` header to hint when to retry.
 */
export class TooManyRequestsError extends HttpException {
	constructor(
		retryAfterSeconds?: number,
		message?: string,
		options?: NamedErrorOptions,
	) {
		super({
			statusCode: 429,
			message: message ?? "Too many requests",
			headers:
				retryAfterSeconds !== undefined
					? {
							"Retry-After": String(retryAfterSeconds),
							...(options?.headers as Record<string, string> | undefined),
						}
					: options?.headers,
			...options,
		});
		this.name = "TooManyRequestsError";
		Object.setPrototypeOf(this, TooManyRequestsError.prototype);
	}
}

// ─── 5xx Server Errors ───────────────────────────────────────────────────────

/**
 * **500 Internal Server Error** — A generic server-side error. Use more specific
 * subclasses when possible.
 */
export class InternalServerError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 500, message, ...options });
		this.name = "InternalServerError";
		Object.setPrototypeOf(this, InternalServerError.prototype);
	}
}

/**
 * **501 Not Implemented** — The server does not support the functionality required
 * to fulfil the request.
 */
export class NotImplementedError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 501, message, ...options });
		this.name = "NotImplementedError";
		Object.setPrototypeOf(this, NotImplementedError.prototype);
	}
}

/**
 * **502 Bad Gateway** — The server, acting as a gateway, received an invalid response
 * from an upstream server.
 */
export class BadGatewayError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 502, message, ...options });
		this.name = "BadGatewayError";
		Object.setPrototypeOf(this, BadGatewayError.prototype);
	}
}

/**
 * **503 Service Unavailable** — The server is temporarily unable to handle the
 * request (e.g., overloaded or under maintenance).
 */
export class ServiceUnavailableError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 503, message, ...options });
		this.name = "ServiceUnavailableError";
		Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
	}
}

/**
 * **504 Gateway Timeout** — The server, acting as a gateway, did not receive
 * a timely response from an upstream server.
 */
export class GatewayTimeoutError extends HttpException {
	constructor(message?: string, options?: NamedErrorOptions) {
		super({ statusCode: 504, message, ...options });
		this.name = "GatewayTimeoutError";
		Object.setPrototypeOf(this, GatewayTimeoutError.prototype);
	}
}

// ─── Re-exports ──────────────────────────────────────────────────────────────

export { HttpException, type HttpExceptionOptions } from "./http-exception";

/**
 * Narrows an unknown `caught` value to `HttpException` for use in `onError` hooks
 * or plain `catch` blocks.
 *
 * @example
 * ```ts
 * app.onError((err, c) => {
 *   if (isHttpException(err)) return err.getResponse();
 *   return c.json({ error: "Internal Server Error" }, 500);
 * });
 * ```
 */
export function isHttpException(value: unknown): value is HttpException {
	return value instanceof HttpException;
}
