import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Context as ServeXContext, Env, ServeXRouter } from '../types';

export type RPCContext = ServeXContext & {
	rpc: { fn: string; input: unknown };
};

export type Infer<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<S>
	: never;

export type RPCMiddleware = (
	ctx: RPCContext,
	next: () => Promise<void>,
) => Promise<void>;

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
	handler(input: TInput, ctx: RPCContext): Promise<TOutput>;
};

export type RPCRegistry = {
	[key: string]:
		| RPCFunctionDef<unknown, unknown, unknown>
		| RPCGroupDef<RPCRegistry>;
};

export type RPCGroupDef<T extends RPCRegistry = RPCRegistry> = {
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

	handler(
		fn: (input: TInput, ctx: RPCContext) => Promise<TOutput>,
	): RPCFunctionDef<TInput, TOutput, _TError>;
}

export interface RPCGroupBuilder<T extends RPCRegistry = Record<string, never>> {
	middlewares(...fns: RPCMiddleware[]): RPCGroupBuilder<T>;
	register<R extends RPCRegistry>(registry: R): RPCGroupDef<R>;
}

export type InferClientFromRegistry<T extends RPCRegistry> = {
	[K in keyof T]: T[K] extends RPCFunctionDef<infer I, infer O, infer E>
		? RPCClientFn<I, O, E>
		: T[K] extends RPCGroupDef<infer R>
			? InferClientFromRegistry<R>
			: never;
};

export type RPCClientFn<TInput, TOutput, _TError> = (
	input: TInput,
) => Promise<TOutput>;

// Forward declaration of RPCPluginInstance from plugin.ts
export type RPCPluginInstance<R extends RPCRegistry> = {
	registry: R;
	install<E extends Env = Env>(server: ServeXRouter<E>): void;
};

export type InferAppRPC<T> = T extends RPCPluginInstance<infer R>
	? InferClientFromRegistry<R>
	: never;
