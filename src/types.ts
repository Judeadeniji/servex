import { Context } from "./context";
import type { StatusCode } from "./http-status";
import type { RouterType } from "./router/adapter";
import type { MergePaths } from "./router/types";
import type { Scope } from "./scope";

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



export type Handler<C extends Context> = RequestHandler<C> | MiddlewareHandler<C>

export type RequestHandler<C extends Context> = (
  ctx: C,
  next: NextFunction
) => Promise<Response> | Response;


export type MiddlewareHandler<C extends Context> = (
  ctx: C,
  next: NextFunction
) => Promise<void | undefined | Response> | void | undefined | Response;


export interface ServerOptions<P extends string = '', P1 extends string = ''> {
  router?: RouterType

  middlewares?: MiddlewareHandler<Context>[];
}

export interface ServeXRouter {
  use(path: string | MiddlewareHandler<Context>, ...middlewares: MiddlewareHandler<Context>[]): this;
  get<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  post<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  put<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  delete<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  patch<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  options<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  head<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  all<P extends string>(path: P, ...handlers: Handler<Context<Env, P>>[]): this;
  route(path: string, fn: (r: ServeXRouter) => void): this;
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
