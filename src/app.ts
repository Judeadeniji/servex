import type { Context } from "./context";
import { baseFetch } from "./core/fetch";
import { RouterAdapter, RouterType } from "./router/adapter";
import type { NormalisePath } from "./router/types";
import type { Env, Handler, Method, MiddlewareHandler, ServerOptions, ServerRoute, ServeXRouter } from "./types";

export class ServeXRequest extends Request {}


export class ServeXRouterImpl<E extends Env = Env, S = {}, B extends string = "/"> implements ServeXRouter<E, S, B> {
    constructor(protected routerAdapter: RouterAdapter<ServerRoute[]>) {}

    get routes(): ServerRoute[] {
        return this.routerAdapter.routes;
    }

    trace(_handler: (api: import("./types").TraceAPI<Context<E>>) => void | Promise<void>): this {
        throw new Error("trace hook can only be registered on the main ServeXApp instance, not a sub-router.");
    }

    use(path: string | MiddlewareHandler<Context>, ...middlewares: MiddlewareHandler<Context>[]) {
        if (typeof path === "string") {
            this.routerAdapter.pushMiddlewares(path, middlewares);
            return this;
        }
        this.routerAdapter.pushMiddlewares("*", [path, ...middlewares]);
        return this;
    }

    private add(method: Method, path: string, handlers: (import("./types").Handler<Context> | import("./types").InlineHandler)[]) {
        let finalHandlers = [...handlers];
        if (finalHandlers.length > 0) {
            const last = finalHandlers[finalHandlers.length - 1];
            if (typeof last !== "function") {
                const inlineVal = last;
                let routeHandler: import("./types").Handler<Context>;
                if (inlineVal instanceof Response) {
                    routeHandler = () => inlineVal.clone();
                } else if (typeof inlineVal === "object" && inlineVal !== null) {
                    routeHandler = (c) => c.json(inlineVal as import("./types").JSONValue);
                } else {
                    routeHandler = (c) => c.text(String(inlineVal));
                }
                finalHandlers[finalHandlers.length - 1] = routeHandler;
                
                // Track native static route if supported
                if (method === "GET" && (this as unknown as { _nativeStaticResponse?: boolean })._nativeStaticResponse && !path.includes(":") && !path.includes("*") && finalHandlers.length === 1) {
                    if (!(this as unknown as { static?: Record<string, Response> }).static) (this as unknown as { static?: Record<string, Response> }).static = {};
                    let res: Response;
                    if (inlineVal instanceof Response) res = inlineVal.clone();
                    else if (typeof inlineVal === "object" && inlineVal !== null) res = new Response(JSON.stringify(inlineVal), { headers: { "Content-Type": "application/json; charset=UTF-8" }});
                    else res = new Response(String(inlineVal), { headers: { "Content-Type": "text/plain; charset=UTF-8" }});
                    const self = this as unknown as { static: Record<string, Response> };
                    self.static[path] = res;
                }
            }
        }

        this.routerAdapter.addRoute({
            method,
            path,
            data: finalHandlers as import("./types").Handler<Context>[]
        });
        return this;
    }

    // @ts-ignore: Implementation signature
    get(path: string, ...handlers: import("./types").Handler<Context<E>>[]) { return this.add("GET", path, handlers as Handler<Context>[]); }
    // @ts-ignore: Implementation signature
    post(path: string, ...handlers: import("./types").Handler<Context<E>>[]) { return this.add("POST", path, handlers as Handler<Context>[]); }
    // @ts-ignore: Implementation signature
    put(path: string, ...handlers: import("./types").Handler<Context<E>>[]) { return this.add("PUT", path, handlers as Handler<Context>[]); }
    // @ts-ignore: Implementation signature
    delete(path: string, ...handlers: import("./types").Handler<Context<E>>[]) { return this.add("DELETE", path, handlers as Handler<Context>[]); }
    // @ts-ignore: Implementation signature
    patch(path: string, ...handlers: import("./types").Handler<Context<E>>[]) { return this.add("PATCH", path, handlers as Handler<Context>[]); }
    // @ts-ignore: Implementation signature
    options(path: string, ...handlers: import("./types").Handler<Context<E>>[]) { return this.add("OPTIONS", path, handlers as Handler<Context>[]); }
    // @ts-ignore: Implementation signature
    head(path: string, ...handlers: import("./types").Handler<Context<E>>[]) { return this.add("HEAD", path, handlers as Handler<Context>[]); }
    // @ts-ignore: Implementation signature
    all(path: string, ...handlers: import("./types").Handler<Context<E>>[]) {
        ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"].forEach(m => { this.add(m as Method, path, handlers as Handler<Context>[]); });
        return this;
    }

    // @ts-ignore: Implementation signature
    route(path: string, fnOrApp: ServeXRouterImpl<E, unknown, string> | ((r: ServeXRouter<E, {}, string>) => unknown)) {
        if (fnOrApp instanceof ServeXRouterImpl) {
            this.routerAdapter.addSubTrie(path, fnOrApp.routerAdapter);
            return this as unknown as ServeXRouter<E, {}, string>;
        }

        const childRouter = new RouterAdapter<ServerRoute[]>({ type: this.routerAdapter.type });
        const childServeXRouter = new ServeXRouterImpl<E, {}, string>(childRouter);
        (fnOrApp as (r: ServeXRouter<E, {}, string>) => unknown)(childServeXRouter as unknown as ServeXRouter<E, {}, string>);
        this.routerAdapter.addSubTrie(path, childRouter);
        return this as unknown as ServeXRouter<E, {}, string>;
    }

    mount(path: string, fetchFn: (request: Request, env?: unknown, ctx?: unknown) => Response | Promise<Response>) {
        // Strip trailing slash if present to ensure the wildcard matches correctly
        const normalizedPath = path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
        
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

        return this as unknown as ServeXRouter<E, {}, string>;
    }

    /**
     * Handle an incoming `Request`.
     * Note: This method is only fully implemented on the main application instance
     * returned by `createServer()`.
     */
    fetch = (_request: Request, _env?: Record<string, unknown>, _executionCtx?: unknown): Response | Promise<Response> => {
        throw new Error(
            "Cannot call fetch() on a sub-router. Please ensure you are calling fetch() on the main application instance created by createServer()."
        );
    };

    /** @see fetch */
    request = (_input: RequestInfo, _init?: RequestInit): Response | Promise<Response> => {
        throw new Error(
            "Cannot call request() on a sub-router. Please ensure you are calling request() on the main application instance created by createServer()."
        );
    };
}

export class ServeXApp<E extends Env = Env, S = {}, B extends string = "/"> extends ServeXRouterImpl<E, S, B> {
    public hooks: import("./types").Hooks = {
        onRequest: [],
        onBeforeHandle: [],
        onAfterHandle: [],
        onError: [],
        onResponse: [],
        trace: []
    };
    public compiledCache = new Map<string, (context: Context) => Promise<Response | undefined>>();

    /**
     * The literal base path this app is scoped to.
     * Always starts with `/`, never ends with `/` (except for the root `"/"`).
     * Typed as the literal `B` so RPC clients can read it from `typeof app`.
     */
    public readonly basePath: B;
    public _nativeStaticResponse: boolean = false;
    public static?: Record<string, Response> & { 
        [K in keyof S as K extends `${string}:${string}` | `${string}*${string}`
            ? never
            : S[K] extends { GET: unknown, IS_STATIC: true }
                ? K
                : never]?: S[K] extends { GET: infer R }
            ? R extends Response ? R : Response & import("./types").TypedResponse<R, 200>
            : Response
    };

    constructor(
        router: RouterAdapter<ServerRoute[]>,
        private middlewares: Handler<Context>[],
        basePath: B = "/" as B,
        public debug: boolean = false,
        public aot: boolean = true,
        nativeStaticResponse: boolean = false
    ) {
        super(router);
        this._nativeStaticResponse = nativeStaticResponse;
        // normalisePath at runtime; cast to B since the normalised form is the
        // contract the user agreed to when writing the literal.
        this.basePath = normalisePath(basePath) as B;
    }

    onRequest(handler: import("./types").HookHandler<Context>) { this.hooks.onRequest.push(handler); return this; }
    onBeforeHandle(handler: import("./types").HookHandler<Context>) { this.hooks.onBeforeHandle.push(handler); return this; }
    onAfterHandle(handler: import("./types").AfterHandleHook<Context>) { this.hooks.onAfterHandle.push(handler); return this; }
    onError(handler: import("./types").ErrorHook<Context>) { this.hooks.onError.push(handler); return this; }
    onResponse(handler: import("./types").HookHandler<Context<E>>) { this.hooks.onResponse.push(handler as never); return this; }
    trace(handler: (api: import("./types").TraceAPI<Context<E>>) => void | Promise<void>) { this.hooks.trace.push(handler as never); return this; }

    use(path: string | import("./types").MiddlewareHandler<Context>, ...middlewares: import("./types").MiddlewareHandler<Context>[]) {
        if (typeof path === "string") {
            if (path === "*" || path === "/*") {
                this.middlewares.push(...middlewares);
            } else {
                this.routerAdapter.pushMiddlewares(path, middlewares);
            }
            return this;
        }
        this.middlewares.push(path, ...middlewares);
        return this;
    }

    fetch = (request: Request, env?: Record<string, unknown>, executionCtx?: unknown): Promise<Response> | Response => {
        const url = request.url;
        const queryIndex = url.indexOf("?", 8);
        const pathIdx = url.indexOf("/", 8);

        let pathname: string;
        if (pathIdx === -1) {
            pathname = "/";
        } else {
            pathname = url.substring(pathIdx, queryIndex === -1 ? url.length : queryIndex);
        }

        // ── Base path stripping ───────────────────────────────────────────────
        if (this.basePath !== "/") {
            if (!pathname.startsWith(this.basePath)) {
                // Request is outside this app's base path — return 404 immediately.
                return new Response(
                    JSON.stringify({ statusCode: 404, error: "Not Found", message: "Not Found" }),
                    { status: 404, headers: { "Content-Type": "application/json; charset=UTF-8" } }
                );
            }
            // Strip the prefix; ensure the remaining path starts with "/".
            pathname = pathname.slice(this.basePath.length) || "/";
        }

        const method = request.method as Method;

        return baseFetch(this.routerAdapter, request, method, pathname, this.middlewares, this.hooks, this.compiledCache, env, executionCtx, this.debug, this.aot);
    };

    request = (input: RequestInfo, init?: RequestInit): Promise<Response> | Response => {
        return this.fetch(new ServeXRequest(input, init));
    };
}

export function createServer<E extends Env = Env, B extends string = "/">(
    options: ServerOptions<B> = {} as ServerOptions<B>
): ServeXRouter<E, {}, NormalisePath<B>> & ServeXApp<E, {}, NormalisePath<B>> {
  const { router = RouterType.SONIC, middlewares = [], basePath, debug = false, aot = true, nativeStaticResponse = false } = options;
  const routerAdapter = new RouterAdapter<ServerRoute[]>({
    type: router,
  });

  return new ServeXApp<E, {}, NormalisePath<B>>(
    routerAdapter,
    middlewares,
    basePath as NormalisePath<B>,
    debug,
    aot,
    nativeStaticResponse
  ) as ServeXRouter<E, {}, NormalisePath<B>> & ServeXApp<E, {}, NormalisePath<B>>;
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