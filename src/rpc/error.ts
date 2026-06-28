import { HttpException } from "../http-exception";
import type { JSONValue } from "../types";

export type RPCErrorCode =
	| "VALIDATION_ERROR"
	| "NOT_FOUND"
	| "UNAUTHORIZED"
	| "INTERNAL_ERROR"
	| "TYPED_ERROR";

export class RPCError extends HttpException<JSONValue> {
	constructor(
		public code: RPCErrorCode,
		message: string,
		public data?: JSONValue,
	) {
		const status =
			code === "UNAUTHORIZED"
				? 401
				: code === "NOT_FOUND"
					? 404
					: code === "VALIDATION_ERROR"
						? 400
						: 500;
		super({
			statusCode: status,
			error: code,
			message,
			data: data ?? undefined,
		});
		this.name = "RPCError";
	}

	toJSON(): JSONValue {
		return {
			ok: false,
			error: {
				code: this.code,
				message: this.message,
				data: this.data ?? null,
			},
		};
	}
}

export class RPCTypedError<T extends JSONValue = JSONValue> extends RPCError {
	constructor(public readonly typedData: T) {
		super("TYPED_ERROR", "Typed RPC error", typedData);
		this.name = "RPCTypedError";
	}
}
