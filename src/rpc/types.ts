import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { MiddlewareHandler, Context as ServeXContext } from '../types';
import type { RPCError, RPCTypedError } from './error';

export type RPCContext = ServeXContext & {
	rpc: { fn: string; input: unknown };
};

export type Infer<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<S>
	: never;

export type RPCMiddleware = MiddlewareHandler<RPCContext>

export type RPCFunctionDef<
	TInput = unknown,
	TOutput = unknown,
	_TError = unknown,
> = {
	_tag: 'RPCFunction';
	inputSchema: StandardSchemaV1 | null;
	outputSchema: StandardSchemaV1 | null;
	errorSchema: StandardSchemaV1 | null;
	middlewares: RPCMiddleware[];
	handler(input: TInput, ctx: RPCContext): Promise<TOutput> | TOutput;
};

export type RPCRegistry = Record<string, unknown>;

export type RPCGroupDef<T extends Record<string, unknown> = Record<string, unknown>> = {
	_tag: 'RPCGroup';
	middlewares: RPCMiddleware[];
	registry: T;
};

export interface RPCFunctionBuilder<
	TInput = unknown,
	TOutput = unknown,
	_TError = unknown,
> {
	input<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<Infer<S>, TOutput, _TError>;

	output<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<TInput, Infer<S>, _TError>;

	error<S extends StandardSchemaV1>(
		schema: S,
	): RPCFunctionBuilder<TInput, TOutput, Infer<S>>;

	middlewares(
		...fns: RPCMiddleware[]
	): RPCFunctionBuilder<TInput, TOutput, _TError>;

	handler<NewInput = unknown, NewOutput = unknown>(
		fn: (
			input: unknown extends TInput ? NewInput : TInput,
			ctx: RPCContext,
		) => Promise<unknown extends TOutput ? NewOutput : TOutput> | (unknown extends TOutput ? NewOutput : TOutput),
	): RPCFunctionDef<
		unknown extends TInput ? NewInput : TInput,
		unknown extends TOutput ? Exclude<Awaited<NewOutput>, Error> : TOutput,
		Extract<Awaited<NewOutput>, RPCTypedError> extends RPCTypedError<infer E> ? E : _TError
	>;
}

export interface RPCGroupBuilder<T extends Record<string, unknown> = Record<string, never>> {
	middlewares(...fns: RPCMiddleware[]): RPCGroupBuilder<T>;
	register<R extends Record<string, unknown>>(registry: R): RPCGroupDef<R>;
}

export type InferClientFromRegistry<T> = {
	[K in keyof T]: T[K] extends RPCFunctionDef<infer I, infer O, infer E>
		? RPCClientFn<I, O, E>
		: T[K] extends RPCGroupDef<infer R>
			? InferClientFromRegistry<R>
			: never;
};

export type RPCClientFn<TInput, TOutput, TError> = (
	input: TInput,
) => Promise<
	| Awaited<TOutput>
	| RPCError
	| (unknown extends TError ? never : TError extends import('../types').JSONValue ? RPCTypedError<TError> : never)
>;

// Forward declaration of RPCPluginInstance from plugin.ts
export type RPCPluginInstance<R extends Record<string, unknown>> = {
	(ctx: ServeXContext): Promise<Response>;
	registry: R;
};

export type InferAppRPC<T> = T extends RPCPluginInstance<infer R>
	? InferClientFromRegistry<R>
	: never;
