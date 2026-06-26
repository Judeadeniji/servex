import { compileHandlerChain } from "./compiler";
import type { Context } from "./context";
import { baseFetch } from "./core/fetch";
import { RouterAdapter, RouterType } from "./router/adapter";
import type { NormalisePath } from "./router/types";
import type {
	Env,
	Handler,
	Method,
	MiddlewareHandler,
	ServerOptions,
	ServerRoute,
	ServeXRouter,
} from "./types";
import { SUPPORTED_METHODS } from "./utils";

export class ServeXRequest extends Request {}

export class ServeXRouterImpl<
	E extends Env = Env,
	S = {},
	B extends string = "/",
> implements ServeXRouter<E, S, B>
{
	public _nativeStaticResponse?: boolean;

	public declare static?: ServeXRouter<E, S, B>["static"];

	constructor(protected routerAdapter: RouterAdapter<ServerRoute[]>) {}

	get routes(): ServerRoute[] {
		return this.routerAdapter.routes;
	}

	onResponse(_handler: import("./types").HookHandler<Context<E>>): this {
		throw new Error(
			"onResponse hook can only be registered on the main ServeXApp instance, not a sub-router.",
		);
	}

	trace(
		_handler: (
			api: import("./types").TraceAPI<Context<E>>,
		) => void | Promise<void>,
	): this {
		throw new Error(
			"trace hook can only be registered on the main ServeXApp instance, not a sub-router.",
		);
	}

	// @ts-ignore: Implementation signature
	use(
		pathOrPlugin:
			| string
			| MiddlewareHandler<Context>
			| import("./types").ServeXPlugin,
		...middlewaresOrPlugins: (
			| MiddlewareHandler<Context>
			| import("./types").ServeXPlugin
		)[]
	) {
		if (
			typeof pathOrPlugin === "object" &&
			pathOrPlugin !== null &&
			"setup" in pathOrPlugin
		) {
			pathOrPlugin.setup(this, "");
			return this;
		}

		if (typeof pathOrPlugin === "string") {
			if (
				middlewaresOrPlugins.length === 1 &&
				typeof middlewaresOrPlugins[0] === "object" &&
				"setup" in middlewaresOrPlugins[0]
			) {
				const plugin =
					middlewaresOrPlugins[0] as import("./types").ServeXPlugin;
				this.route(pathOrPlugin, (childApp) =>
					plugin.setup(childApp, pathOrPlugin),
				);
				return this;
			}
			this.routerAdapter.pushMiddlewares(
				pathOrPlugin,
				middlewaresOrPlugins as MiddlewareHandler<Context>[],
			);
			return this;
		}

		this.routerAdapter.pushMiddlewares("*", [
			pathOrPlugin as MiddlewareHandler<Context>,
			...(middlewaresOrPlugins as MiddlewareHandler<Context>[]),
		]);
		return this;
	}

	private add(
		method: Method,
		path: string,
		handlers: (
			| import("./types").Handler<import("./context").Context>
			| import("./types").InlineHandler
		)[],
	) {
		const finalHandlers = [...handlers];
		for (let i = 0; i < handlers.length; i++) {
			const handler = handlers[i];
			if (
				typeof handler !== "function" &&
				!(
					typeof handler === "object" &&
					handler !== null &&
					"__validator" in handler
				)
			) {
				const inlineVal = handler;
				let routeHandler: import("./types").Handler<
					import("./context").Context
				>;

				if (inlineVal instanceof Response) {
					routeHandler = () => inlineVal.clone();
				} else if (typeof inlineVal === "object" && inlineVal !== null) {
					routeHandler = (c: import("./context").Context) =>
						c.json(inlineVal as import("./types").JSONValue);
				} else {
					routeHandler = (c) => c.text(String(inlineVal));
				}
				finalHandlers[finalHandlers.length - 1] = routeHandler;

				// Track native static route if supported
				if (
					method === "GET" &&
					this._nativeStaticResponse &&
					!path.includes(":") &&
					!path.includes("*") &&
					finalHandlers.length === 1
				) {
					// 1. Assert the initialization to satisfy Error 2322
					if (!this.static) {
						this.static = {} as ServeXRouter<E, S, B>["static"];
					}

					let res: Response;
					if (inlineVal instanceof Response) {
						res = inlineVal;
					} else if (typeof inlineVal === "object" && inlineVal !== null) {
						res = new Response(JSON.stringify(inlineVal), {
							headers: { "Content-Type": "application/json; charset=UTF-8" },
						});
					} else {
						res = new Response(String(inlineVal), {
							headers: { "Content-Type": "text/plain; charset=UTF-8" },
						});
					}

					// 2. Cast to a mutable Record to bypass Errors 2532 and 2862
					(this.static as Record<string, Response>)[path] = res;
				}
			}
		}

		this.routerAdapter.addRoute({
			method,
			path,
			handlers: finalHandlers as import("./types").Handler<Context>[],
		});
		return this;
	}

	// @ts-ignore: Implementation signature
	get(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		return this.add(
			"GET",
			path,
			handlers as import("./types").Handler<Context>[],
		);
	}
	// @ts-ignore: Implementation signature
	post(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		return this.add(
			"POST",
			path,
			handlers as import("./types").Handler<Context>[],
		);
	}
	// @ts-ignore: Implementation signature
	put(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		return this.add(
			"PUT",
			path,
			handlers as import("./types").Handler<Context>[],
		);
	}
	// @ts-ignore: Implementation signature
	delete(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		return this.add(
			"DELETE",
			path,
			handlers as import("./types").Handler<Context>[],
		);
	}
	// @ts-ignore: Implementation signature
	patch(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		return this.add(
			"PATCH",
			path,
			handlers as import("./types").Handler<Context>[],
		);
	}
	// @ts-ignore: Implementation signature
	options(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		return this.add(
			"OPTIONS",
			path,
			handlers as import("./types").Handler<Context>[],
		);
	}
	// @ts-ignore: Implementation signature
	head(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		return this.add(
			"HEAD",
			path,
			handlers as import("./types").Handler<Context>[],
		);
	}
	// @ts-ignore: Implementation signature
	all(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
		SUPPORTED_METHODS.forEach((m) => {
			this.add(m.toUpperCase() as Method, path, handlers as Handler<Context>[]);
		});
		return this;
	}

	// @ts-ignore: Implementation signature
	route(
		path: string,
		fnOrApp:
			| ServeXRouterImpl<E, unknown, string>
			| ((r: ServeXRouter<E, {}, string>) => unknown),
	) {
		if (fnOrApp instanceof ServeXRouterImpl) {
			this.routerAdapter.addSubTrie(path, fnOrApp.routerAdapter);
			//@ts-expect-error
			return this as ServeXRouter<E, {}, string>;
		}

		const childRouter = new RouterAdapter<ServerRoute[]>({
			type: this.routerAdapter.type,
		});
		const childServeXRouter = new ServeXRouterImpl<E, {}, string>(childRouter);
		(fnOrApp as (r: ServeXRouter<E, {}, string>) => unknown)(
			childServeXRouter as ServeXRouter<E, {}, string>,
		);
		this.routerAdapter.addSubTrie(path, childRouter);
		return this as ServeXRouter<E, {}, string>;
	}

	mount<P extends string>(
		path: P,
		fetchFn: (
			request: Request,
			env?: unknown,
			ctx?: unknown,
		) => Response | Promise<Response>,
	): ServeXRouter<E, S, B> {
		// Strip trailing slash if present to ensure the wildcard matches correctly
		const normalizedPath =
			path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;

		const handler = (c: import("./context").Context) => {
			const req = c.req;
			const url = new URL(req.url);

			// Strip the mount path from the URL
			let newPathname = url.pathname.slice(normalizedPath.length);
			if (!newPathname.startsWith("/")) {
				newPathname = `/${newPathname}`;
			}
			url.pathname = newPathname;

			// Create a new request with the stripped URL
			const newReq = new Request(url.toString(), req);
			return fetchFn(newReq, c.env, c.executionCtx);
		};

		// Mount a catch-all route at the specified path
		this.all(`${normalizedPath}/*`, handler);

		// Also map the exact path without trailing slash
		this.all(normalizedPath, handler);

		return this as ServeXRouter<E, S, B>;
	}

	/**
	 * Handle an incoming `Request`.
	 * Note: This method is only fully implemented on the main application instance
	 * returned by `createServer()`.
	 */
	fetch = (
		_request: Request,
		_env?: Record<string, unknown>,
		_executionCtx?: unknown,
	): Response | Promise<Response> => {
		throw new Error(
			"Cannot call fetch() on a sub-router. Please ensure you are calling fetch() on the main application instance created by createServer().",
		);
	};

	/** @see fetch */
	request = (
		_input: RequestInfo,
		_init?: RequestInit,
	): Response | Promise<Response> => {
		throw new Error(
			"Cannot call request() on a sub-router. Please ensure you are calling request() on the main application instance created by createServer().",
		);
	};
}

export class ServeXApp<
	E extends Env = Env,
	S = {},
	B extends string = "/",
> extends ServeXRouterImpl<E, S, B> {
	public hooks: import("./types").Hooks = {
		onRequest: [],
		onBeforeHandle: [],
		onAfterHandle: [],
		onError: [],
		onResponse: [],
		trace: [],
	};

	/**
	 * The literal base path this app is scoped to.
	 * Always starts with `/`, never ends with `/` (except for the root `"/"`).
	 * Typed as the literal `B` so RPC clients can read it from `typeof app`.
	 */
	public readonly basePath: B;
	public _nativeStaticResponse: boolean = false;

	constructor(
		router: RouterAdapter<ServerRoute[]>,
		private middlewares: Handler<Context>[],
		basePath: B = "/" as B,
		public debug: boolean = false,
		public aot: boolean = true,
		nativeStaticResponse: boolean = false,
	) {
		super(router);
		this._nativeStaticResponse = nativeStaticResponse;
		// normalisePath at runtime; cast to B since the normalised form is the
		// contract the user agreed to when writing the literal.
		this.basePath = normalisePath(basePath) as B;
	}

	onRequest(handler: import("./types").HookHandler<Context>) {
		this.hooks.onRequest.push(handler);
		return this;
	}

	compile(): this {
		for (const route of this.routerAdapter.routes) {
			const methodsToMatch =(
				route.method === "ALL" ? SUPPORTED_METHODS : [route.method]) as Method[];
			for (const method of methodsToMatch) {
				const matched = this.routerAdapter.match(method, route.path);
				if (matched?.handlers && matched.store) {
					if (!matched.store.executor) {
						matched.store.executor = compileHandlerChain(
							matched.handlers as import("./types").Handler<Context>[],
						);
					}
				}
			}
		}
		return this;
	}
	onBeforeHandle(handler: import("./types").HookHandler<Context>) {
		this.hooks.onBeforeHandle.push(handler);
		return this;
	}
	onAfterHandle(handler: import("./types").AfterHandleHook<Context>) {
		this.hooks.onAfterHandle.push(handler);
		return this;
	}
	onError(handler: import("./types").ErrorHook<Context>) {
		this.hooks.onError.push(handler);
		return this;
	}
	onResponse(handler: import("./types").HookHandler<Context<E>>) {
		this.hooks.onResponse.push(handler as never);
		return this;
	}
	trace(
		handler: (
			api: import("./types").TraceAPI<Context<E>>,
		) => void | Promise<void>,
	) {
		this.hooks.trace.push(handler as never);
		return this;
	}

	// @ts-ignore: Implementation signature
	use(
		pathOrPlugin:
			| string
			| import("./types").MiddlewareHandler<Context>
			| import("./types").ServeXPlugin,
		...middlewaresOrPlugins: (
			| import("./types").MiddlewareHandler<Context>
			| import("./types").ServeXPlugin
		)[]
	) {
		if (
			typeof pathOrPlugin === "object" &&
			pathOrPlugin !== null &&
			"setup" in pathOrPlugin
		) {
			super.use(pathOrPlugin as import("./types").ServeXPlugin);
			return this;
		}

		if (typeof pathOrPlugin === "string") {
			if (
				middlewaresOrPlugins.length === 1 &&
				typeof middlewaresOrPlugins[0] === "object" &&
				"setup" in middlewaresOrPlugins[0]
			) {
				super.use(
					pathOrPlugin,
					middlewaresOrPlugins[0] as import("./types").ServeXPlugin,
				);
				return this;
			}
			if (pathOrPlugin === "*" || pathOrPlugin === "/*") {
				this.middlewares.push(...middlewaresOrPlugins);
				this.routerAdapter.pushMiddlewares("*", middlewaresOrPlugins);
			} else {
				this.routerAdapter.pushMiddlewares(pathOrPlugin, middlewaresOrPlugins);
			}
			return this;
		}
		this.middlewares.push(pathOrPlugin, ...middlewaresOrPlugins);
		this.routerAdapter.pushMiddlewares("*", [
			pathOrPlugin,
			...middlewaresOrPlugins,
		]);
		return this;
	}

	fetch = (
		request: Request,
		env?: Record<string, unknown>,
		executionCtx?: unknown,
	): Promise<Response> | Response => {
		const url = request.url;
		const queryIndex = url.indexOf("?", 8);
		const pathIdx = url.indexOf("/", 8);

		let pathname: string;
		if (pathIdx === -1) {
			pathname = "/";
		} else {
			pathname = url.substring(
				pathIdx,
				queryIndex === -1 ? url.length : queryIndex,
			);
		}

		// ── Base path stripping ───────────────────────────────────────────────
		if (this.basePath !== "/") {
			if (!pathname.startsWith(this.basePath)) {
				// Request is outside this app's base path — return 404 immediately.
				return new Response(
					JSON.stringify({
						statusCode: 404,
						error: "Not Found",
						message: "Not Found",
					}),
					{
						status: 404,
						headers: { "Content-Type": "application/json; charset=UTF-8" },
					},
				);
			}
			// Strip the prefix; ensure the remaining path starts with "/".
			pathname = pathname.slice(this.basePath.length) || "/";
		}

		const method = request.method as Method;

		return baseFetch(
			this.routerAdapter,
			request,
			method,
			pathname,
			this.middlewares,
			this.hooks,
			env,
			executionCtx as import("./core/fetch").ServeXExecutionContext | undefined,
			this.debug,
			this.aot,
		);
	};

	request = (
		input: RequestInfo,
		init?: RequestInit,
	): Promise<Response> | Response => {
		return this.fetch(new ServeXRequest(input, init));
	};

	listen(
		portOrOptions: number | string | Partial<import("bun").ServeOptions>,
		callback?: (server: import("bun").Server) => void,
	): import("bun").Server {
		this.compile();

		let options: Partial<import("bun").ServeOptions> = {};
		if (
			typeof portOrOptions === "number" ||
			typeof portOrOptions === "string"
		) {
			options = { port: portOrOptions };
		} else {
			options = portOrOptions;
		}

		const server = Bun.serve({
			...options,
			fetch: this.fetch,
		});

		if (callback) {
			callback(server);
		}

		return server;
	}
}

export function createServer<E extends Env = Env, B extends string = "/">(
	options: ServerOptions<B> = {} as ServerOptions<B>,
): ServeXRouter<E, {}, NormalisePath<B>> & ServeXApp<E, {}, NormalisePath<B>> {
	const {
		router = RouterType.SONIC,
		middlewares = [],
		basePath,
		debug = false,
		aot = true,
		nativeStaticResponse = false,
	} = options;
	const routerAdapter = new RouterAdapter<ServerRoute[]>({
		type: router,
	});

	return new ServeXApp<E, {}, NormalisePath<B>>(
		routerAdapter,
		middlewares,
		basePath as NormalisePath<B>,
		debug,
		aot,
		nativeStaticResponse,
	) as ServeXRouter<E, {}, NormalisePath<B>> &
		ServeXApp<E, {}, NormalisePath<B>>;
}

/**
 * Normalises a base path:
 *  - Ensures it starts with "/".
 *  - Strips any trailing slash (except for root "/").
 * @internal
 */
export function normalisePath(path: string): string {
	if (!path || path === "/") return "/";
	const withLeading = path.startsWith("/") ? path : `/${path}`;
	return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}
