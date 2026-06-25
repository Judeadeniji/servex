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
		this._inputSchema = schema;
		// biome-ignore lint/suspicious/noExplicitAny: Fluent builder type casting
		return this as any;
	}

	output<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<TInput, Infer<S>, TError> {
		this._outputSchema = schema;
		// biome-ignore lint/suspicious/noExplicitAny: Fluent builder type casting
		return this as any;
	}

	error<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<TInput, TOutput, Infer<S>> {
		this._errorSchema = schema;
		// biome-ignore lint/suspicious/noExplicitAny: Fluent builder type casting
		return this as any;
	}

	middlewares(
		...fns: RPCMiddleware[]
	): RPCFunctionBuilder<TInput, TOutput, TError> {
		this._middlewares.push(...fns);
		// biome-ignore lint/suspicious/noExplicitAny: Fluent builder type casting
		return this as any;
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
