import { compileHandlerChain } from "../compiler";
import { type Context, createContext } from "../context";
import { HttpException } from "../http-exception";
import type { RouterAdapter } from "../router/adapter";
import type { MatchedRoute } from "../router/base";
import type {
	Handler,
	Hooks,
	Method,
	TraceAPI,
	TraceEvent,
	TraceEventInfo,
	TraceListener,
} from "../types";
import { executeHandlers } from "./response";

const DEFAULT_ENV = typeof process !== "undefined" ? process.env : {};

/**
 * Resolves the route params object from a matched route.
 *
 * The SonicRouter JIT codegen avoids allocating a keyed object in the hot
 * path — it instead returns `params: null` plus a positional `paramValues`
 * array whose indices correspond to `store.paramsKeys`.  This function
 * reconstructs the keyed object when that optimisation is in effect, while
 * passing through a pre-built `params` object unchanged for all other
 * router implementations.
 */
function resolveRouteParams(
	route: MatchedRoute,
): Record<string, string> | null {
	if (route.params !== null) return route.params;
	const values = route.paramValues;
	if (!values || values.length === 0) return null;
	const keys = (
		route.store as { paramsKeys?: string[] } | undefined
	)?.paramsKeys;
	if (!keys || keys.length === 0) return null;
	const params: Record<string, string> = {};
	const len = Math.min(keys.length, values.length);
	for (let i = 0; i < len; i++) {
		params[keys[i]] = values[i];
	}
	return params;
}

// ── Trace Helper ─────────────────────────────────────────────────────────────
async function executeOnRequestPhase(
	hooks: Hooks,
	context: Context,
	onReqLen: number,
) {
	for (let i = 0; i < onReqLen; i++) {
		const r = hooks.onRequest[i](context);
		const result = r instanceof Promise ? await r : r;
		if (result instanceof Response) return result;
	}
}

async function execute404Phase(
	context: Context,
	middlewares: Handler<Context>[],
) {
	const res = await executeHandlers(context, middlewares);
	return res || new Response("Not Found", { status: 404 });
}

async function executeOnBeforePhase(
	hooks: Hooks,
	context: Context,
	onBeforeLen: number,
) {
	for (let i = 0; i < onBeforeLen; i++) {
		const r = hooks.onBeforeHandle[i](context);
		const result = r instanceof Promise ? await r : r;
		if (result instanceof Response) return result;
	}
}

async function executeHandlePhase(
	context: Context,
	executor:
		| ((c: Context) => Response | Promise<Response | undefined> | undefined)
		| undefined,
	handlers: Handler<Context>[],
	jit: boolean,
) {
	let result: Response | undefined;
	if (jit) {
		result = await executor?.(context);
	} else {
		result = await executeHandlers(context, handlers);
	}
	return result || new Response("Not Found", { status: 404 });
}

async function executeOnAfterPhase(
	hooks: Hooks,
	context: Context,
	response: Response,
	onAfterLen: number,
) {
	let res = response;
	for (let i = 0; i < onAfterLen; i++) {
		const r = hooks.onAfterHandle[i](context, res);
		const result = r instanceof Promise ? await r : r;
		if (result instanceof Response) res = result;
	}
	return res;
}

async function executeOnErrorPhase(
	hooks: Hooks,
	context: Context,
	error: Error,
	onErrLen: number,
) {
	for (let i = 0; i < onErrLen; i++) {
		const r = hooks.onError[i](error, context);
		const result = r instanceof Promise ? await r : r;
		if (result instanceof Response) return result;
	}
}

async function executeTracePhaseWithArgs<T, Args extends unknown[]>(
	listeners: TraceListener[] | undefined,
	phaseExecutor: (...args: Args) => Promise<T> | T,
	...args: Args
): Promise<T> {
	if (!listeners || listeners.length === 0) return phaseExecutor(...args);

	const begin = performance.now();
	const onStopCallbacks: ((
		info: TraceEventInfo,
	) => void | Promise<void>)[] = [];
	const event: TraceEvent = {
		begin,
		onStop: (cb) => onStopCallbacks.push(cb),
	};

	for (let i = 0; i < listeners.length; i++) {
		const r = listeners[i](event);
		if (r instanceof Promise) await r;
	}

	const finalize = async (error: Error | null) => {
		const end = performance.now();
		for (let i = 0; i < onStopCallbacks.length; i++) {
			const r = onStopCallbacks[i]({ begin, end, error });
			if (r instanceof Promise) await r;
		}
	};

	try {
		const result = phaseExecutor(...args);
		if (result instanceof Promise) {
			const res = await result;
			await finalize(null);
			return res;
		}

		await finalize(null);
		return result;
	} catch (err: unknown) {
		const error = err instanceof Error ? err : new Error(String(err));
		await finalize(error);
		throw err;
	}
}

export interface ServeXExecutionContext {
	waitUntil?: (promise: Promise<unknown> | unknown) => void;
	passThroughOnException?: () => void;
	[key: string]: unknown;
}

function sharedHandleValue(
	r: Response | undefined,
	context: Context,
	hooks: Hooks,
	executionCtx: ServeXExecutionContext | undefined,
): Response {
	const res = r || new Response("Not Found", { status: 404 });
	context.finalResponse = res;
	const postProcessPromise = executePostProcess(hooks, context);
	if (executionCtx && typeof executionCtx.waitUntil === "function") {
		executionCtx.waitUntil(postProcessPromise);
	} else {
		postProcessPromise.catch(console.error);
	}
	return res;
}

function sharedResolveError(error: unknown, debug: boolean): Response {
	if (error instanceof HttpException) return error.getResponse();
	console.error("Unhandled error:", error);

	const message = debug
		? error instanceof Error
			? error.message
			: String(error)
		: "An unexpected error occurred";

	const httpException = new HttpException({
		statusCode: 500,
		error: "Internal Server Error",
		message,
		data: debug && error instanceof Error ? { stack: error.stack } : undefined,
		cause: error,
	});

	return httpException.getResponse();
}

export function baseFetch(
	// @ts-ignore
	router: RouterAdapter,
	// @ts-ignore
	request: Request,
	method: Method,
	pathname: string,
	middlewares: Handler<Context>[],
	hooks: Hooks,
	envBindings?: Record<string, unknown>,
	executionCtx?: ServeXExecutionContext,
	debug: boolean = false,
	jit: boolean = true,
): Response | Promise<Response> {
	// ── Slow Path ──────────────────────────────────────────────────────────────
	if (
		hooks.onRequest.length > 0 ||
		hooks.onBeforeHandle.length > 0 ||
		hooks.onAfterHandle.length > 0 ||
		hooks.onError.length > 0 ||
		hooks.trace.length > 0
	) {
		return baseFetchSlow(
			router,
			request,
			method,
			pathname,
			middlewares,
			hooks,
			envBindings,
			executionCtx,
			debug,
			jit,
		);
	}

	// ── Fast Path (No Hooks) ───────────────────────────────────────────────────
	const route = router.match(method, pathname);
	if (!route?.matched) {
		if (middlewares.length > 0) {
			return baseFetchSlow(
				router,
				request,
				method,
				pathname,
				middlewares,
				hooks,
				envBindings,
				executionCtx,
				debug,
				jit,
			);
		}
		if (route?.is405)
			return new Response("Method Not Allowed", { status: 405 });
		return new Response("Not Found", { status: 404 });
	}

	let executor:
		| ((
				context: Context,
		  ) => Response | Promise<Response | undefined> | undefined)
		| undefined;

	if (jit) {
		if (!executor) {
			const handlers = Array.isArray(route.handlers)
				? route.handlers
				: [route.handlers];
			executor = compileHandlerChain(handlers as Handler<Context>[]);
			if (route.store) route.store.executor = executor;
			route.executor = executor;
		}
	}

	let context: Context | undefined = createContext(
		request,
		envBindings ?? DEFAULT_ENV,
		resolveRouteParams(route),
		executionCtx,
		debug,
	);

	try {
		let res: Response | Promise<Response | undefined> | undefined;
		if (jit) {
			res = executor!(context);
		} else {
			const handlers = Array.isArray(route.handlers)
				? route.handlers
				: [route.handlers];
			res = executeHandlers(context, handlers as Handler<Context>[]);
		}

		if (res instanceof Promise) {
			return res
				.then((r) => {
					if (r instanceof Error) {
						r = sharedResolveError(r, debug);
					}
					const result = sharedHandleValue(r, context!, hooks, executionCtx);
					context = undefined;
					return result;
				})
				.catch((error) => {
					const result = sharedHandleValue(
						sharedResolveError(error, debug),
						context!,
						hooks,
						executionCtx,
					);
					context = undefined;
					return result;
				});
		}
		if (res instanceof Error) {
			res = sharedResolveError(res, debug);
		}
		const finalRes = sharedHandleValue(res, context!, hooks, executionCtx);
		context = undefined;
		return finalRes;
	} catch (error) {
		const finalRes = sharedHandleValue(
			sharedResolveError(error, debug),
			context!,
			hooks,
			executionCtx,
		);
		context = undefined;
		return finalRes;
	}
}

async function baseFetchSlow(
	router: RouterAdapter,
	request: Request,
	method: Method,
	pathname: string,
	middlewares: Handler<Context>[],
	hooks: Hooks,
	envBindings?: Record<string, unknown>,
	executionCtx?: ServeXExecutionContext,
	debug: boolean = false,
	jit: boolean = true,
): Promise<Response> {
	let response: Response | undefined;

	let traceApi: TraceAPI<Context> | undefined;
	let traceListeners:
		| Record<string, TraceListener[]>
		| undefined;
	let context: Context | undefined;

	try {
		// ── Route matching ────────────────────────────────────────────────────────
		const route = router.match(method, pathname);
		const is405 = !route?.matched && route?.is405;
		if (is405) {
			return new Response("Method Not Allowed", { status: 405 });
		}

		context = createContext(
			request,
			envBindings ?? DEFAULT_ENV,
			route ? resolveRouteParams(route) : null,
			executionCtx,
			debug,
		);

		// ── 1. onRequest ──────────────────────────────────────────────────────────
		const onReqLen = hooks.onRequest.length;
		const hasTrace = hooks.trace.length > 0;

		if (hasTrace) {
			traceListeners = {
				request: [],
				beforeHandle: [],
				handle: [],
				afterHandle: [],
				error: [],
				response: [],
			};
			traceApi = {
				context,
				onRequest: (cb) => traceListeners?.request.push(cb),
				onBeforeHandle: (cb) => traceListeners?.beforeHandle.push(cb),
				onHandle: (cb) => traceListeners?.handle.push(cb),
				onAfterHandle: (cb) => traceListeners?.afterHandle.push(cb),
				onError: (cb) => traceListeners?.error.push(cb),
				onResponse: (cb) => traceListeners?.response.push(cb),
			};
			for (let i = 0; i < hooks.trace.length; i++) {
				const r = hooks.trace[i](traceApi);
				if (r instanceof Promise) await r;
			}
		}

		if (onReqLen > 0 || (traceListeners && traceListeners.request.length > 0)) {
			const res = await executeTracePhaseWithArgs(
				traceListeners?.request,
				executeOnRequestPhase,
				hooks,
				context,
				onReqLen,
			);
			if (res instanceof Response) return res;
		}

		if (!route?.matched) {
			// 404 path: execute global middlewares
			response = await executeTracePhaseWithArgs(
				traceListeners?.handle,
				execute404Phase,
				context,
				middlewares,
			);

			// 3. onAfterHandle for 404
			const onAfterLen = hooks.onAfterHandle.length;
			if (
				onAfterLen > 0 ||
				(traceListeners && traceListeners.afterHandle.length > 0)
			) {
				response = (await executeTracePhaseWithArgs(
					traceListeners?.afterHandle,
					executeOnAfterPhase,
					hooks,
					context,
					response,
					onAfterLen,
				)) as Response;
			}
			return response!;
		}

		// ── 2. onBeforeHandle ─────────────────────────────────────────────────────
		const onBeforeLen = hooks.onBeforeHandle.length;
		if (
			onBeforeLen > 0 ||
			(traceListeners && traceListeners.beforeHandle.length > 0)
		) {
			const res = await executeTracePhaseWithArgs(
				traceListeners?.beforeHandle,
				executeOnBeforePhase,
				hooks,
				context,
				onBeforeLen,
			);
			if (res instanceof Response) return res;
		}

		// ── 3. Execute handlers ───────────────────────────────────────────────────
		let executor:
			| ((
					context: Context,
			  ) => Response | Promise<Response | undefined> | undefined)
			| undefined;
		let finalHandlers: Handler<Context>[] = [];
		if (jit) {
			executor = route.executor || (route.store?.executor as typeof executor);
			if (!executor) {
				finalHandlers = (
					Array.isArray(route.handlers) ? route.handlers : [route.handlers]
				) as Handler<Context>[];
				executor = compileHandlerChain(finalHandlers);
				if (route.store) route.store.executor = executor;
				route.executor = executor;
			}
		} else {
			finalHandlers = (
				Array.isArray(route.handlers) ? route.handlers : [route.handlers]
			) as Handler<Context>[];
		}

		response = await executeTracePhaseWithArgs(
			traceListeners?.handle,
			executeHandlePhase,
			context,
			executor,
			finalHandlers,
			jit,
		);

		// ── 4. onAfterHandle ──────────────────────────────────────────────────────
		const onAfterLen = hooks.onAfterHandle.length;
		if (
			onAfterLen > 0 ||
			(traceListeners && traceListeners.afterHandle.length > 0)
		) {
			response = (await executeTracePhaseWithArgs(
				traceListeners?.afterHandle,
				executeOnAfterPhase,
				hooks,
				context,
				response!,
				onAfterLen,
			)) as Response;
		}
	} catch (error) {
		// ── onError hooks ─────────────────────────────────────────────────────────
		const onErrLen = hooks.onError.length;
		if (
			context &&
			(onErrLen > 0 || (traceListeners && traceListeners.error.length > 0))
		) {
			const errRes = await executeTracePhaseWithArgs(
				traceListeners?.error,
				executeOnErrorPhase,
				hooks,
				context,
				error as Error,
				onErrLen,
			);
			if (errRes instanceof Response) {
				response = errRes;
			}
		}

		if (!response) {
			if (error instanceof HttpException) {
				response = error.getResponse();
			} else {
				console.error("Unhandled error:", error);
				const payload: Record<string, unknown> = {
					statusCode: 500,
					error: "Internal Server Error",
					message: "An unexpected error occurred",
				};
				if (debug) {
					payload.message =
						error instanceof Error ? error.message : String(error);
					payload.stack = error instanceof Error ? error.stack : undefined;
				}
				response = new Response(JSON.stringify(payload), {
					status: 500,
					headers: { "Content-Type": "application/json; charset=UTF-8" },
				});
			}
		}
	} finally {
		if (context && response) {
			context.finalResponse = response;
		}
		// ── Post-Response Processing ─────────────────────────────────────────────
		if (
			context &&
			(hooks.onResponse.length > 0 ||
				context.deferred ||
				(traceListeners && traceListeners.response.length > 0))
		) {
			const postProcessPromise = ((ctx, tListeners) =>
				executePostProcess(hooks, ctx, tListeners))(
				context,
				traceListeners?.response,
			);
			if (executionCtx && typeof executionCtx.waitUntil === "function") {
				executionCtx.waitUntil(postProcessPromise);
			} else {
				postProcessPromise.catch(console.error);
			}
		}

		context = undefined;
		traceApi = undefined;
		traceListeners = undefined;
	}

	return response!;
}

async function executePostProcess(
	hooks: Hooks,
	context: Context,
	responseListeners?: TraceListener[],
) {
	context.markFinished();
	try {
		if (context.deferred) {
			const len = context.deferred.length;
			for (let i = 0; i < len; i++) {
				const r = context.deferred[i]();
				if (r instanceof Promise) await r;
			}
		}
		const len = hooks.onResponse.length;
		for (let i = 0; i < len; i++) {
			const r = hooks.onResponse[i](context);
			if (r instanceof Promise) await r;
		}

		if (responseListeners && responseListeners.length > 0) {
			const begin = performance.now();
			const onStopCallbacks: ((
				info: TraceEventInfo,
			) => void | Promise<void>)[] = [];
			const event: TraceEvent = {
				begin,
				onStop: (cb) => onStopCallbacks.push(cb),
			};

			for (let i = 0; i < responseListeners.length; i++) {
				const r = responseListeners[i](event);
				if (r instanceof Promise) await r;
			}

			const end = performance.now();
			for (let j = 0; j < onStopCallbacks.length; j++) {
				const s = onStopCallbacks[j]({ begin, end, error: null });
				if (s instanceof Promise) await s;
			}
		}
	} catch (e) {
		console.error("ServeX background task error:", e);
	}
}
