export type RPCErrorCode =
	| 'VALIDATION_ERROR'
	| 'NOT_FOUND'
	| 'UNAUTHORIZED'
	| 'INTERNAL_ERROR'
	| 'TYPED_ERROR';

export class RPCError extends Error {
	constructor(
		public code: RPCErrorCode,
		message: string,
		public data?: unknown,
	) {
		super(message);
		this.name = 'RPCError';
	}

	toJSON() {
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

export class RPCTypedError<T = unknown> extends RPCError {
	constructor(public readonly typedData: T) {
		super('TYPED_ERROR', 'Typed RPC error', typedData);
		this.name = 'RPCTypedError';
	}
}
