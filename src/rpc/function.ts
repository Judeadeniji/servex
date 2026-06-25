import type { StandardSchemaV1 } from '@standard-schema/spec';
import type {
	Infer,
	RPCContext,
	RPCFunctionBuilder,
	RPCFunctionDef,
	RPCMiddleware,
} from './types';

export function createRPCFunction(): RPCFunctionBuilder {
	return new RPCFunctionBuilderImpl();
}

class RPCFunctionBuilderImpl<TInput, TOutput, TError>
	implements RPCFunctionBuilder<TInput, TOutput, TError>
{
	private _inputSchema: StandardSchemaV1 | null = null;
	private _outputSchema: StandardSchemaV1 | null = null;
	private _errorSchema: StandardSchemaV1 | null = null;
	private _middlewares: RPCMiddleware[] = [];

	input<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<Infer<S>, TOutput, TError> {
		const next = new RPCFunctionBuilderImpl<Infer<S>, TOutput, TError>();
		next._inputSchema = schema;
		next._outputSchema = this._outputSchema;
		next._errorSchema = this._errorSchema;
		next._middlewares = [...this._middlewares];
		return next;
	}

	output<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<TInput, Infer<S>, TError> {
		const next = new RPCFunctionBuilderImpl<TInput, Infer<S>, TError>();
		next._inputSchema = this._inputSchema;
		next._outputSchema = schema;
		next._errorSchema = this._errorSchema;
		next._middlewares = [...this._middlewares];
		return next;
	}

	error<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<TInput, TOutput, Infer<S>> {
		const next = new RPCFunctionBuilderImpl<TInput, TOutput, Infer<S>>();
		next._inputSchema = this._inputSchema;
		next._outputSchema = this._outputSchema;
		next._errorSchema = schema;
		next._middlewares = [...this._middlewares];
		return next;
	}

	middlewares(
		...fns: RPCMiddleware[]
	): RPCFunctionBuilder<TInput, TOutput, TError> {
		const next = new RPCFunctionBuilderImpl<TInput, TOutput, TError>();
		next._inputSchema = this._inputSchema;
		next._outputSchema = this._outputSchema;
		next._errorSchema = this._errorSchema;
		next._middlewares = [...this._middlewares, ...fns];
		return next;
	}

	handler(
		fn: (input: TInput, ctx: RPCContext) => Promise<TOutput>,
	): RPCFunctionDef<TInput, TOutput, TError> {
		return {
			_tag: 'RPCFunction',
			inputSchema: this._inputSchema,
			outputSchema: this._outputSchema,
			errorSchema: this._errorSchema,
			middlewares: this._middlewares,
			handler: fn,
		};
	}
}
