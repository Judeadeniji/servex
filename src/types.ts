import { Context } from "./context";
import type { StatusCode } from "./http-status";
import type { RouterType } from "./router/adapter";
import type { AbsolutePath, NormalisePath } from "./router/types";
import type { HttpException } from "./http-exception";


type Bindings = object;
type Variables = object;

export type Env = Partial<{
  Bindings: Bindings;
  Variables: Variables;
}>;


export type ServerRoute = {
  method: Method; // Added HTTP method
  path: string;
  data: Handler<Context>[];
};



export interface Handler<C extends Context = Context> {
  (ctx: C, next: NextFunction): Promise<Response | void | undefined> | Response | void | undefined;
}

export interface RequestHandler<C extends Context = Context> {
  (ctx: C, next: NextFunction): Promise<Response> | Response;
}

export type MiddlewareHandler<C extends Context> = Handler<C>;


export interface ServerOptions<B extends string = "/"> {
  router?: RouterType;
  middlewares?: MiddlewareHandler<Context>[];
  /**
   * A common URL prefix that is stripped from every incoming request's
   * pathname before routing. Useful when the app is mounted at a sub-path
   * (e.g. behind a reverse-proxy or in a sub-directory).
   *
   * The literal type of this value is captured as the `B` type parameter on
   * the returned app, making fully-qualified route paths available to RPC
   * clients via the schema type `S`.
   *
   * @example
   * const app = createServer({ basePath: "/api/v1" });
   * //    ^? ServeXApp<Env, {}, "/api/v1">
   * app.get("/users", handler);
   * //       schema S becomes { "/api/v1/users": { GET: ... } }
   */
  basePath?: B;
}

export type HookHandler<C extends Context> = (ctx: C) => void | Promise<void> | Response | Promise<Response>;
export type AfterHandleHook<C extends Context> = (ctx: C, response: Response) => void | Promise<void> | Response | Promise<Response>;
export type ErrorHook<C extends Context> = (error: HttpException | Error, ctx: C) => void | Promise<void> | Response | Promise<Response>;

export interface Hooks {
  onRequest: HookHandler<Context>[];
  onBeforeHandle: HookHandler<Context>[];
  onAfterHandle: AfterHandleHook<Context>[];
  onError: ErrorHook<Context>[];
  onResponse: HookHandler<Context>[];
}

export type ExtractResponseType<T> = T extends (...args: any[]) => infer R | Promise<infer R> ? R : never;
export type Last<T extends any[]> = T extends readonly [...any, infer L] ? L : never;

export interface ServeXRouter<E extends Env = Env, S = {}, B extends string = "/"> {
  use(path: string | MiddlewareHandler<Context>, ...middlewares: MiddlewareHandler<Context>[]): this;

  get<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
  get<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
  get<P extends string, R>(path: P, m1: Handler, m2: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;
  get<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { GET: R } }, B>;

  post<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
  post<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
  post<P extends string, R>(path: P, m1: Handler, m2: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;
  post<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { POST: R } }, B>;

  put<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
  put<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;
  put<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PUT: R } }, B>;

  delete<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
  delete<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;
  delete<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { DELETE: R } }, B>;

  patch<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
  patch<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;
  patch<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { PATCH: R } }, B>;

  options<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
  options<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;
  options<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { OPTIONS: R } }, B>;

  head<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
  head<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;
  head<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { HEAD: R } }, B>;

  all<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
  all<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;
  all<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in AbsolutePath<B, P>]: { ALL: R } }, B>;

  route<P extends string, ChildSchema = {}>(path: P, fn: (r: ServeXRouter<E, {}, AbsolutePath<B, P>>) => ServeXRouter<E, ChildSchema, AbsolutePath<B, P>> | void): ServeXRouter<E, S & ChildSchema, B>;
  route<P extends string, ChildSchema = {}>(path: P, app: ServeXRouter<any, ChildSchema, any>): ServeXRouter<E, S & ChildSchema, B>;

  /**
   * Mount a WinterTC-compliant fetch function to a specific path.
   * This allows interoperability with frameworks like Hono, Remix, Itty Router, etc.
   *
   * @example
   * const hono = new Hono().get("/", (c) => c.text("Hono!"));
   * app.mount("/hono", hono.fetch);
   */
  mount<P extends string>(path: P, fetchFn: (request: Request, env?: any, ctx?: any) => Response | Promise<Response>): ServeXRouter<E, S, B>;

  /**
   * Handle an incoming `Request` — compatible with Cloudflare Workers, Bun,
   * and Deno. Always present on the chained type so it can be referenced after
   * any number of `.get().post()…` calls without a type cast.
   */
  fetch(request: Request, env?: any, executionCtx?: any): Response | Promise<Response>;

  /**
   * Convenience wrapper: constructs a `Request` from `input` and delegates to
   * `fetch`. Useful in tests and server-side `request()` calls.
   */
  request(input: RequestInfo, init?: RequestInit): Response | Promise<Response>;
}

// http methods
export type Method =
  | "ALL"
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD";

// Headers Record
export type HeaderRecord = Record<string, string | string[]>;

// Body Response Types
export type Data = string | ArrayBuffer | Blob | ReadableStream;

// Helper Types for Setting and Getting Headers
export type SetHeaders = (
  name: string,
  value: string | undefined,
  options?: { append?: boolean }
) => void;
export type GetHeaders = (name: string) => string | null;

// Placeholder for JSON Values
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

// Renderer Type (for HTML rendering)
export type Renderer = (...args: any[]) => Response | Promise<Response>;

export type KnownResponseFormat = "json" | "text" | "redirect";
export type ResponseFormat = KnownResponseFormat | string;

export type TypedResponse<
  T = unknown,
  U extends StatusCode = StatusCode,
  F extends ResponseFormat = T extends string
    ? "text"
    : T extends JSONValue
    ? "json"
    : ResponseFormat
> = {
  _data: T;
  _status: U;
  _format: F;
};

export type NextFunction = () => Promise<void>;
export declare function fetch(request: Request): Promise<Response>

export { Context };
