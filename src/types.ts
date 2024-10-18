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

export type Route<P extends string, P1 extends string> = <C extends Context<Env, P>>(
  scope: Scope<ServerRoute[]>,
  parent?: P1
) => {
  method: Method;
  path: P;
  handlers: Handler<C>[];
  children?: Route<string, string>[]
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
  routes: Route<P, P1>[];
  middlewares?: MiddlewareHandler<Context>[];
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
