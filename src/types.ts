import { Context } from "./context";
import type { StatusCode } from "./http-status";
import type { RouterType } from "./router/adapter";
import type { MergePaths } from "./router/types";
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


export interface ServerOptions<P extends string = '', P1 extends string = ''> {
  router?: RouterType
  middlewares?: MiddlewareHandler<Context>[];
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

export interface ServeXRouter<E extends Env = Env, S = {}> {
  use(path: string | MiddlewareHandler<Context>, ...middlewares: MiddlewareHandler<Context>[]): this;
  get<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { GET: R } }>;
  get<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { GET: R } }>;
  get<P extends string, R>(path: P, m1: Handler, m2: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { GET: R } }>;
  get<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { GET: R } }>;

  post<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { POST: R } }>;
  post<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { POST: R } }>;
  post<P extends string, R>(path: P, m1: Handler, m2: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { POST: R } }>;
  post<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { POST: R } }>;

  put<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { PUT: R } }>;
  put<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { PUT: R } }>;
  put<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { PUT: R } }>;

  delete<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { DELETE: R } }>;
  delete<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { DELETE: R } }>;
  delete<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { DELETE: R } }>;

  patch<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { PATCH: R } }>;
  patch<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { PATCH: R } }>;
  patch<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { PATCH: R } }>;

  options<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { OPTIONS: R } }>;
  options<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { OPTIONS: R } }>;
  options<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { OPTIONS: R } }>;

  head<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { HEAD: R } }>;
  head<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { HEAD: R } }>;
  head<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { HEAD: R } }>;

  all<P extends string, R>(path: P, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { ALL: R } }>;
  all<P extends string, R>(path: P, m1: Handler, handler: (ctx: Context<E, P>, next: NextFunction) => R | Promise<R>): ServeXRouter<E, S & { [K in P]: { ALL: R } }>;
  all<P extends string, R>(path: P, ...handlers: Handler[]): ServeXRouter<E, S & { [K in P]: { ALL: R } }>;
  route<P extends string, ChildSchema = {}>(path: P, fn: (r: ServeXRouter<E>) => ServeXRouter<E, ChildSchema> | void): ServeXRouter<E, S & { [K in P]: ChildSchema }>;
  route<P extends string, ChildSchema = {}>(path: P, app: ServeXRouter<any, ChildSchema>): ServeXRouter<E, S & { [K in P]: ChildSchema }>;
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
