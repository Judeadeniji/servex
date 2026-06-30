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

// ── Route param resolution ────────────────────────────────────────────────────

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
	const keys = (route.store as { paramsKeys?: string[] } | undefined)
		?.paramsKeys;
	if (!keys || keys.length === 0) return null;
	const params: Record<string, string> = {};
	const len = Math.min(keys.length, values.length);
	for (let i = 0; i < len; i++) {
		params[keys[i]] = values[i];
	}
	return params;
}

// ── Executor cache ────────────────────────────────────────────────────────────

/**
 * Returns the cached compiled executor for a matched route, compiling it on
 * first access when JIT is enabled.  Called once per route across all
 * requests — subsequent requests read directly from `route.store.executor`.
 */
function getOrCompileExecutor(
	route: MatchedRoute,
	jit: boolean,
):
	| ((context: Context) => Response | Promise<Response | undefined> | undefined)
	| undefined {
	if (!jit) return undefined;

	const cached = (route.executor ?? route.store?.executor) as (
		context: Context,
	) => Response | Promise<Response | undefined> | undefined;
	if (cached) return cached;

	const handlers = (
		Array.isArray(route.handlers) ? route.handlers : [route.handlers]
	) as Handler<Context>[];

	const executor = compileHandlerChain(handlers);
	if (route.store) route.store.executor = executor;
	route.executor = executor;
	return executor;
}

// ── Error resolution ──────────────────────────────────────────────────────────

/**
 * Single unified error → Response converter used by both the fast and full
 * request paths.
 *
 * - `HttpException` instances are serialised via their own `getResponse()`.
 * - All other errors produce a 500 JSON body; when `debug` is true the message
 *   and stack trace are included.
 *
 * Replaces the former `sharedResolveError` (fast path) and the inline JSON
 * object construction (slow path) which produced different response shapes.
 */
function resolveErrorResponse(error: unknown, debug: boolean): Response {
	if (error instanceof HttpException) return error.getResponse();

	const message = debug
		? error instanceof Error
			? error.message
			: String(error)
		: "An unexpected error occurred";

	return Response.json(
		{
			statusCode: 500,
			error: "Internal Server Error",
			message,
			...(debug && error instanceof Error ? { stack: error.stack } : {}),
		},
		{
			status: 500,
			headers: { "Content-Type": "application/json; charset=UTF-8" },
		},
	);
}

// ── Post-response scheduling ──────────────────────────────────────────────────

/**
 * Schedules `work` to run after the response value has been produced but
 * before control returns to the caller's await point.
 *
 * - CF Workers / Deno: `executionCtx.waitUntil` keeps the request alive.
 * - All other runtimes: `Promise.resolve().then()` (microtask) is used so
 *   that `markFinished`, `onResponse`, and deferred callbacks all fire
 *   inside the same microtask checkpoint as `await app.fetch(...)` — which
 *   is what tests expect.  We intentionally avoid `setImmediate` here
 *   because that defers past the microtask queue and would cause tests that
 *   check side-effects synchronously after the await to fail.
 */
function schedulePostResponse(
	work: () => Promise<void>,
	executionCtx?: ServeXExecutionContext,
): void {
	if (executionCtx && typeof executionCtx.waitUntil === "function") {
		executionCtx.waitUntil(work());
	} else {
		Promise.resolve().then(work);
	}
}

// ── Trace helper ──────────────────────────────────────────────────────────────

/**
 * Runs a set of `TraceListener`s around a phase, recording begin/end timing
 * and forwarding any error that occurred.
 *
 * Unlike the former `executeTracePhaseWithArgs` this helper is *not* generic
 * over `...args` — callers pass a zero-argument thunk `phase()` so the
 * function has a fixed call-site shape that V8 can monomorphise.
 */
async function runWithTrace<T>(
	listeners: TraceListener[],
	phase: () => Promise<T> | T,
	error?: Error | null,
): Promise<T> {
	const begin = performance.now();
	const onStops: ((info: TraceEventInfo) => void | Promise<void>)[] = [];
	const event: TraceEvent = {
		begin,
		onStop: (cb) => onStops.push(cb),
	};

	for (let i = 0; i < listeners.length; i++) {
		const r = listeners[i](event);
		if (r instanceof Promise) await r;
	}

	let result: T;
	let phaseError: Error | null = null;

	try {
		result = await phase();
	} catch (err) {
		phaseError = err instanceof Error ? err : new Error(String(err));
		throw err;
	} finally {
		const end = performance.now();
		const info: TraceEventInfo = {
			begin,
			end,
			error: phaseError ?? error ?? null,
		};
		for (let i = 0; i < onStops.length; i++) {
			const r = onStops[i](info);
			if (r instanceof Promise) await r;
		}
	}

	return result!;
}

// ── Post-response execution ───────────────────────────────────────────────────

async function executePostProcess(
	hooks: Hooks,
	context: Context,
	responseListeners?: TraceListener[],
): Promise<void> {
	context.markFinished();

	try {
		// Deferred callbacks registered by handlers via context.defer()
		if (context.deferred) {
			const len = context.deferred.length;
			for (let i = 0; i < len; i++) {
				const r = context.deferred[i]();
				if (r instanceof Promise) await r;
			}
		}

		// onResponse hooks
		const len = hooks.onResponse.length;
		for (let i = 0; i < len; i++) {
			const r = hooks.onResponse[i](context);
			if (r instanceof Promise) await r;
		}

		// Trace response listeners
		if (responseListeners && responseListeners.length > 0) {
			await runWithTrace(responseListeners, async () => {});
		}
	} catch (e) {
		console.error("ServeX post-response error:", e);
	}
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ServeXExecutionContext {
	waitUntil?: (promise: Promise<unknown> | unknown) => void;
	passThroughOnException?: () => void;
	[key: string]: unknown;
}

// ── baseFetch ─────────────────────────────────────────────────────────────────

/**
 * Core request dispatcher.
 *
 * Architecture (after refactor):
 *
 * ```
 * baseFetch()
 *   │
 *   ├─ [zero hooks, no trace]  ──► fast path (may return sync Response)
 *   │     match → context → execute → finalize
 *   │
 *   └─ [any hook or trace]  ──► full async path (one flat function)
 *         onRequest → match → 404/middlewares → onBeforeHandle
 *         → execute → onAfterHandle
 *         catch → onError → resolveErrorResponse
 *         finally → schedulePostResponse
 * ```
 *
 * Key differences from the previous implementation:
 * - No `baseFetch`/`baseFetchSlow` split — one function, two internal paths.
 * - Hook presence is checked per-phase with length guards, not as a global
 *   gate that forces ALL requests through an async path.
 * - No `executeTracePhaseWithArgs` generic wrapper — trace runs via the
 *   typed `runWithTrace` helper called only at phases that have listeners.
 * - The `jit` boolean is used once (in `getOrCompileExecutor`) not threaded
 *   through 4 layers of function calls.
 * - Error serialisation is unified: `resolveErrorResponse` replaces both
 *   `sharedResolveError` and the inline JSON construction in the slow path,
 *   which produced different response shapes.
 * - Post-response uses `setImmediate` (Bun/Node) or `Promise.resolve().then`
 *   (edge) instead of a raw `.catch`, mirroring Elysia's approach.
 */
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
	const onReqLen = hooks.onRequest.length;
	const onBeforeLen = hooks.onBeforeHandle.length;
	const onAfterLen = hooks.onAfterHandle.length;
	const onErrLen = hooks.onError.length;
	const traceLen = hooks.trace.length;

	// ── Fast path ─────────────────────────────────────────────────────────────
	// Zero lifecycle hooks and no trace → stay synchronous when possible.
	// This is the common case for high-throughput routes.
	if (
		onReqLen === 0 &&
		onBeforeLen === 0 &&
		onAfterLen === 0 &&
		onErrLen === 0 &&
		traceLen === 0
	) {
		const route = router.match(method, pathname);

		if (!route?.matched) {
			// Unmatched with global middlewares → delegate to full path
			// so middlewares can handle the request (e.g. a catch-all logger).
			if (middlewares.length > 0) {
				return fullRequestPath(
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
					onReqLen,
					onBeforeLen,
					onAfterLen,
					onErrLen,
					traceLen,
				);
			}
			if (route?.is405)
				return new Response("Method Not Allowed", { status: 405 });
			return new Response("Not Found", { status: 404 });
		}

		const executor = getOrCompileExecutor(route, jit);
		const handlers = executor
			? undefined
			: ((Array.isArray(route.handlers)
					? route.handlers
					: [route.handlers]) as Handler<Context>[]);

		const context: Context | undefined = createContext(
			request,
			envBindings ?? DEFAULT_ENV,
			resolveRouteParams(route),
			executionCtx,
			debug,
		);

		try {
			const res = executor
				? executor(context)
				: executeHandlers(context, handlers!);

			if (res instanceof Promise) {
				return res
					.then((r) => {
						// JIT compiler may return Error instances as values
						const response =
							r instanceof Response
								? r
								: (r as unknown) instanceof Error
									? resolveErrorResponse(r as unknown as Error, debug)
									: new Response("Not Found", { status: 404 });
						context!.finalResponse = response;
						schedulePostResponse(
							() => executePostProcess(hooks, context!),
							executionCtx,
						);
						return response;
					})
					.catch((error) => {
						const response = resolveErrorResponse(error, debug);
						context!.finalResponse = response;
						schedulePostResponse(
							() => executePostProcess(hooks, context!),
							executionCtx,
						);
						return response;
					});
			}

			// JIT compiler may return Error instances as values
			const response =
				res instanceof Response
					? res
					: (res as unknown) instanceof Error
						? resolveErrorResponse(res, debug)
						: new Response("Not Found", { status: 404 });
			context.finalResponse = response;
			schedulePostResponse(
				() => executePostProcess(hooks, context!),
				executionCtx,
			);
			return response;
		} catch (error) {
			const response = resolveErrorResponse(error, debug);
			context.finalResponse = response;
			schedulePostResponse(
				() => executePostProcess(hooks, context!),
				executionCtx,
			);
			return response;
		}
	}

	// ── Full path (any hook or trace present) ──────────────────────────────────
	return fullRequestPath(
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
		onReqLen,
		onBeforeLen,
		onAfterLen,
		onErrLen,
		traceLen,
	);
}

// ── Full request path ─────────────────────────────────────────────────────────

/**
 * The full async lifecycle path: all hook phases inlined with per-phase
 * length guards.  Trace wrapping is applied only to phases that have
 * registered listeners, detected via `hasTrace` once at function entry.
 *
 * Phases (in order):
 *  1. Trace API bootstrap (if trace hooks present)
 *  2. onRequest
 *  3. Route match + 404 / 405
 *  4. Context creation
 *  5. onBeforeHandle
 *  6. Execute handler chain (JIT executor or slow-path executeHandlers)
 *  7. onAfterHandle
 *  catch → onError hooks → resolveErrorResponse
 *  finally → schedulePostResponse (deferred, onResponse, trace response)
 */
async function fullRequestPath(
	router: RouterAdapter,
	request: Request,
	method: Method,
	pathname: string,
	middlewares: Handler<Context>[],
	hooks: Hooks,
	envBindings: Record<string, unknown> | undefined,
	executionCtx: ServeXExecutionContext | undefined,
	debug: boolean,
	jit: boolean,
	onReqLen: number,
	onBeforeLen: number,
	onAfterLen: number,
	onErrLen: number,
	traceLen: number,
): Promise<Response> {
	const hasTrace = traceLen > 0;

	let response: Response | undefined;
	let context: Context | undefined;

	// Per-phase trace listener arrays (populated by the TraceAPI below)
	let tRequest: TraceListener[] | undefined;
	let tBeforeHandle: TraceListener[] | undefined;
	let tHandle: TraceListener[] | undefined;
	let tAfterHandle: TraceListener[] | undefined;
	let tError: TraceListener[] | undefined;
	let tResponse: TraceListener[] | undefined;
	let traceApi: TraceAPI<Context> | undefined;

	try {
		// ── 1. Bootstrap trace ─────────────────────────────────────────────────
		if (hasTrace) {
			tRequest = [];
			tBeforeHandle = [];
			tHandle = [];
			tAfterHandle = [];
			tError = [];
			tResponse = [];

			// Context is not yet available, so provide a lazy getter
			// that resolves once context has been created.
			let _ctx: Context | undefined;
			traceApi = {
				get context() {
					return _ctx as Context;
				},
				onRequest: (cb) => tRequest!.push(cb),
				onBeforeHandle: (cb) => tBeforeHandle!.push(cb),
				onHandle: (cb) => tHandle!.push(cb),
				onAfterHandle: (cb) => tAfterHandle!.push(cb),
				onError: (cb) => tError!.push(cb),
				onResponse: (cb) => tResponse!.push(cb),
			};

			for (let i = 0; i < traceLen; i++) {
				const r = hooks.trace[i](traceApi);
				if (r instanceof Promise) await r;
			}

			// Now create context and wire it back into the traceApi getter
			const route = router.match(method, pathname);
			if (!route?.matched && route?.is405) {
				return new Response("Method Not Allowed", { status: 405 });
			}
			context = createContext(
				request,
				envBindings ?? DEFAULT_ENV,
				route ? resolveRouteParams(route) : null,
				executionCtx,
				debug,
			);
			_ctx = context;

			// ── 2. onRequest (with trace) ──────────────────────────────────────
			if (onReqLen > 0 || tRequest.length > 0) {
				const res = await runWithTrace(tRequest, async () => {
					for (let i = 0; i < onReqLen; i++) {
						const r = hooks.onRequest[i](context!);
						const result = r instanceof Promise ? await r : r;
						if (result instanceof Response) return result;
					}
				});
				if (res instanceof Response) return res;
			}

			// ── 3. 404 / middlewares (with trace) ──────────────────────────────
			if (!route?.matched) {
				response = await runWithTrace(tHandle, async () => {
					if (middlewares.length > 0) {
						const r = await executeHandlers(context!, middlewares);
						return r ?? new Response("Not Found", { status: 404 });
					}
					return new Response("Not Found", { status: 404 });
				});

				if (onAfterLen > 0 || tAfterHandle!.length > 0) {
					response = await runWithTrace(tAfterHandle!, async () => {
						let res = response!;
						for (let i = 0; i < onAfterLen; i++) {
							const r = hooks.onAfterHandle[i](context!, res);
							const result = r instanceof Promise ? await r : r;
							if (result instanceof Response) res = result;
						}
						return res;
					});
				}
				return response!;
			}

			// ── 4. onBeforeHandle (with trace) ────────────────────────────────
			if (onBeforeLen > 0 || tBeforeHandle.length > 0) {
				const res = await runWithTrace(tBeforeHandle, async () => {
					for (let i = 0; i < onBeforeLen; i++) {
						const r = hooks.onBeforeHandle[i](context!);
						const result = r instanceof Promise ? await r : r;
						if (result instanceof Response) return result;
					}
				});
				if (res instanceof Response) return res;
			}

			// ── 5. Execute handlers (with trace) ──────────────────────────────
			const executor = getOrCompileExecutor(route, jit);
			const handlers = executor
				? undefined
				: ((Array.isArray(route.handlers)
						? route.handlers
						: [route.handlers]) as Handler<Context>[]);

			response = await runWithTrace(tHandle, async () => {
				const r = executor
					? await executor(context!)
					: await executeHandlers(context!, handlers!);
				// JIT compiler may return Error instances as values
				if (r instanceof Error) throw r;
				return r instanceof Response
					? r
					: new Response("Not Found", { status: 404 });
			});

			// ── 6. onAfterHandle (with trace) ─────────────────────────────────
			if (onAfterLen > 0 || tAfterHandle.length > 0) {
				response = await runWithTrace(tAfterHandle, async () => {
					let res = response!;
					for (let i = 0; i < onAfterLen; i++) {
						const r = hooks.onAfterHandle[i](context!, res);
						const result = r instanceof Promise ? await r : r;
						if (result instanceof Response) res = result;
					}
					return res;
				});
			}

			return response!;
		}

		// ── No trace: inlined phases without wrapping overhead ─────────────────

		// ── 1. Route match (early 405) ─────────────────────────────────────────
		const route = router.match(method, pathname);
		if (!route?.matched && route?.is405) {
			return new Response("Method Not Allowed", { status: 405 });
		}

		// ── 2. Context ─────────────────────────────────────────────────────────
		context = createContext(
			request,
			envBindings ?? DEFAULT_ENV,
			route ? resolveRouteParams(route) : null,
			executionCtx,
			debug,
		);

		// ── 3. onRequest ───────────────────────────────────────────────────────
		for (let i = 0; i < onReqLen; i++) {
			const r = hooks.onRequest[i](context);
			const result = r instanceof Promise ? await r : r;
			if (result instanceof Response) return result;
		}

		// ── 4. 404 / middlewares ───────────────────────────────────────────────
		if (!route?.matched) {
			if (middlewares.length > 0) {
				const r = await executeHandlers(context, middlewares);
				response = r ?? new Response("Not Found", { status: 404 });
			} else {
				response = new Response("Not Found", { status: 404 });
			}

			for (let i = 0; i < onAfterLen; i++) {
				const r = hooks.onAfterHandle[i](context, response);
				const result = r instanceof Promise ? await r : r;
				if (result instanceof Response) response = result;
			}
			return response;
		}

		// ── 5. onBeforeHandle ──────────────────────────────────────────────────
		for (let i = 0; i < onBeforeLen; i++) {
			const r = hooks.onBeforeHandle[i](context);
			const result = r instanceof Promise ? await r : r;
			if (result instanceof Response) return result;
		}

		// ── 6. Execute handlers ────────────────────────────────────────────────
		const executor = getOrCompileExecutor(route, jit);
		const handlers = executor
			? undefined
			: ((Array.isArray(route.handlers)
					? route.handlers
					: [route.handlers]) as Handler<Context>[]);

		const handlerResult = executor
			? await executor(context)
			: await executeHandlers(context, handlers!);

		// JIT compiler may return Error instances as values — treat as thrown
		if (handlerResult instanceof Error) throw handlerResult;

		response =
			handlerResult instanceof Response
				? handlerResult
				: new Response("Not Found", { status: 404 });

		// ── 7. onAfterHandle ───────────────────────────────────────────────────
		for (let i = 0; i < onAfterLen; i++) {
			const r = hooks.onAfterHandle[i](context, response);
			const result = r instanceof Promise ? await r : r;
			if (result instanceof Response) response = result;
		}
	} catch (error) {
		// ── onError hooks (and trace error listeners) ──────────────────────────
		const hasErrListeners =
			context && (onErrLen > 0 || (hasTrace && tError && tError.length > 0));
		if (hasErrListeners) {
			const phase = async () => {
				for (let i = 0; i < onErrLen; i++) {
					const r = hooks.onError[i](error as Error, context!);
					const result = r instanceof Promise ? await r : r;
					if (result instanceof Response) return result;
				}
			};

			const errRes =
				hasTrace && tError && tError.length > 0
					? await runWithTrace(
							tError,
							phase,
							error instanceof Error ? error : new Error(String(error)),
						)
					: await phase();

			if (errRes instanceof Response) {
				response = errRes;
			}
		}

		if (!response) {
			response = resolveErrorResponse(error, debug);
		}
	} finally {
		if (context) {
			if (response) context.finalResponse = response;

			// Capture tResponse NOW before the cleanup below clears the outer
			// variable — the closure passed to schedulePostResponse would
			// otherwise see `undefined` when it eventually runs.
			const capturedResponseListeners = tResponse;

			const needsPostProcess =
				hooks.onResponse.length > 0 ||
				!!context.deferred ||
				(hasTrace &&
					capturedResponseListeners &&
					capturedResponseListeners.length > 0);

			if (needsPostProcess) {
				schedulePostResponse(
					() => executePostProcess(hooks, context!, capturedResponseListeners),
					executionCtx,
				);
			}
		}

		// Release all references so GC can collect per-request state
		traceApi = undefined;
		tRequest =
			tBeforeHandle =
			tHandle =
			tAfterHandle =
			tError =
			tResponse =
				undefined;
	}

	return response!;
}
