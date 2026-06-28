import type {
	ClientErrorStatusCode,
	ServerErrorStatusCode,
	StatusCode,
} from "./http-status";

/**
 * The shape of the structured JSON body returned by an `HttpException`.
 */
export interface HttpExceptionBody {
	statusCode: number;
	error: string;
	message: string;
	data?: unknown;
}

/**
 * Options accepted by the `HttpException` constructor.
 */
export interface HttpExceptionOptions<T = unknown> {
	/** The HTTP status code (e.g., 400, 404, 500). */
	statusCode: ClientErrorStatusCode | ServerErrorStatusCode | number;
	/** A short, machine-readable error name (e.g., "Bad Request"). */
	error?: string;
	/** A human-readable description of what went wrong. */
	message?: string;
	/** Optional arbitrary payload to include in the response body. */
	data?: T;
	/** Extra headers to attach to the generated Response. */
	headers?: HeadersInit;
	/** The original error that caused this exception (for logging / stack traces). */
	cause?: unknown;
}

/**
 * Base HTTP exception that can be thrown inside any handler or middleware.
 * ServeX catches it in every execution path (fast path + slow path) and calls
 * `getResponse()` automatically, so the framework always returns a properly
 * formatted JSON error to the client.
 *
 * @example
 * ```ts
 * app.get("/secret", (c) => {
 *   throw new HttpException({ statusCode: 401, message: "Token missing" });
 * });
 * ```
 */
export class HttpException<T = unknown> extends Error {
	public readonly statusCode:
		| ClientErrorStatusCode
		| ServerErrorStatusCode
		| number;
	public readonly error: string;
	public override readonly message: string;
	public readonly data?: T;
	public readonly headers?: HeadersInit;

	constructor(options: HttpExceptionOptions<T>) {
		const {
			statusCode,
			error = HTTP_ERROR_NAMES[
				statusCode as ClientErrorStatusCode | ServerErrorStatusCode
			] ?? "Error",
			message = error ?? "An error occurred",
			data,
			headers,
			cause,
		} = options;

		super(message, { cause });
		this.name = "HttpException";
		this.statusCode = statusCode;
		this.error = error;
		this.message = message;
		this.data = data;
		this.headers = headers;

		// Restore prototype chain in transpiled environments.
		Object.setPrototypeOf(this, new.target.prototype);
	}

	/**
	 * Returns a structured JSON body describing the error.
	 */
	public getBody(): HttpExceptionBody {
		const body: HttpExceptionBody = {
			statusCode: this.statusCode,
			error: this.error,
			message: this.message,
		};
		if (this.data !== undefined) body.data = this.data;
		return body;
	}

	/**
	 * Converts the exception to a standard `Response` object with a JSON body
	 * and the correct status code / headers.
	 */
	public getResponse(): Response {
		return new Response(JSON.stringify(this.getBody()), {
			status: this.statusCode,
			headers: {
				"Content-Type": "application/json; charset=UTF-8",
				...(this.headers as Record<string, string> | undefined),
			},
		});
	}

	// ─── Static factory helpers ──────────────────────────────────────────────

	/** 400 Bad Request */
	static badRequest(message?: string, data?: unknown, headers?: HeadersInit) {
		return new HttpException({ statusCode: 400, message, data, headers });
	}
	/** 401 Unauthorized */
	static unauthorized(message?: string, data?: unknown, headers?: HeadersInit) {
		return new HttpException({ statusCode: 401, message, data, headers });
	}
	/** 402 Payment Required */
	static paymentRequired(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 402, message, data, headers });
	}
	/** 403 Forbidden */
	static forbidden(message?: string, data?: unknown, headers?: HeadersInit) {
		return new HttpException({ statusCode: 403, message, data, headers });
	}
	/** 404 Not Found */
	static notFound(message?: string, data?: unknown, headers?: HeadersInit) {
		return new HttpException({ statusCode: 404, message, data, headers });
	}
	/** 405 Method Not Allowed */
	static methodNotAllowed(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 405, message, data, headers });
	}
	/** 406 Not Acceptable */
	static notAcceptable(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 406, message, data, headers });
	}
	/** 408 Request Timeout */
	static requestTimeout(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 408, message, data, headers });
	}
	/** 409 Conflict */
	static conflict(message?: string, data?: unknown, headers?: HeadersInit) {
		return new HttpException({ statusCode: 409, message, data, headers });
	}
	/** 410 Gone */
	static gone(message?: string, data?: unknown, headers?: HeadersInit) {
		return new HttpException({ statusCode: 410, message, data, headers });
	}
	/** 413 Content Too Large */
	static contentTooLarge(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 413, message, data, headers });
	}
	/** 415 Unsupported Media Type */
	static unsupportedMediaType(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 415, message, data, headers });
	}
	/** 422 Unprocessable Entity */
	static unprocessableEntity(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 422, message, data, headers });
	}
	/** 429 Too Many Requests */
	static tooManyRequests(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 429, message, data, headers });
	}
	/** 500 Internal Server Error */
	static internalServerError(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 500, message, data, headers });
	}
	/** 501 Not Implemented */
	static notImplemented(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 501, message, data, headers });
	}
	/** 502 Bad Gateway */
	static badGateway(message?: string, data?: unknown, headers?: HeadersInit) {
		return new HttpException({ statusCode: 502, message, data, headers });
	}
	/** 503 Service Unavailable */
	static serviceUnavailable(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 503, message, data, headers });
	}
	/** 504 Gateway Timeout */
	static gatewayTimeout(
		message?: string,
		data?: unknown,
		headers?: HeadersInit,
	) {
		return new HttpException({ statusCode: 504, message, data, headers });
	}
}

/**
 * Human-readable names for common HTTP error status codes.
 * @internal
 */
export const HTTP_ERROR_NAMES: Partial<Record<StatusCode, string>> = {
	400: "Bad Request",
	401: "Unauthorized",
	402: "Payment Required",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	406: "Not Acceptable",
	407: "Proxy Authentication Required",
	408: "Request Timeout",
	409: "Conflict",
	410: "Gone",
	411: "Length Required",
	412: "Precondition Failed",
	413: "Content Too Large",
	414: "URI Too Long",
	415: "Unsupported Media Type",
	416: "Range Not Satisfiable",
	417: "Expectation Failed",
	418: "I'm a Teapot",
	421: "Misdirected Request",
	422: "Unprocessable Entity",
	423: "Locked",
	424: "Failed Dependency",
	425: "Too Early",
	426: "Upgrade Required",
	428: "Precondition Required",
	429: "Too Many Requests",
	431: "Request Header Fields Too Large",
	451: "Unavailable For Legal Reasons",
	500: "Internal Server Error",
	501: "Not Implemented",
	502: "Bad Gateway",
	503: "Service Unavailable",
	504: "Gateway Timeout",
	505: "HTTP Version Not Supported",
	506: "Variant Also Negotiates",
	507: "Insufficient Storage",
	508: "Loop Detected",
	510: "Not Extended",
	511: "Network Authentication Required",
};
