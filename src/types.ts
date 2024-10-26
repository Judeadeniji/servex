import type { createServer, ServeX } from ".";
import { Context } from "./context";
import type { StatusCode } from "./http-status";
import type { RouterType } from "./router/adapter";
import type { Scope } from "./scope";

type Bindings = object;
type Variables = object;
type Globals = object;

export declare namespace ServeX {
  export interface Env {
    Bindings?: Bindings;
    Variables?: Variables;
    Globals?: Globals;
  }
}

export type Env = ServeX.Env;

export type ServerRoute = {
  method: Method; // Added HTTP method
  path: string;
  data: Handler<Env>[];
};

export type Route<E extends Env, P extends string, P1 extends string> = (
  scope: Scope<E, ServerRoute[]>,
  parent?: P1
) => {
  method: Method;
  path: P;
  handlers: Handler<E>[];
  children?: Route<E, string, string>[];
};

export type RequestContext<E extends Env> = {
  parsedBody: any;
  params: Record<string, string>;
  query: URLSearchParams;
  globals: Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>;
  path: string;
};

export type Handler<E extends Env> = RequestHandler<E> | MiddlewareHandler<E>;

export type RequestHandler<E extends Env> = (
  ctx: Context<E>,
  next: NextFunction
) => Promise<Response> | Response;

export type MiddlewareHandler<E extends Env> = (
  ctx: Context<E>,
  next: NextFunction
) => Promise<void | undefined | Response> | void | undefined | Response;

export type PluginContext<E extends Env = Env> = {
  scope: Scope<E, ServerRoute[]>;
  server: ServeX<E>;
  env?: E;
  events$: {
    [K in keyof PluginLifecycleEvents<E>]: (
      cb: PluginLifecycleEvents<E>[K]
    ) => void;
  };
};

export type PluginLifecycleEvents<E extends Env> = {
  onRequest: (requestContext: RequestContext<E>, request: Request) => void;
  onResponse: (requestContext: RequestContext<E>, response: Response) => void;
};

export interface Plugin<E extends Env = Env> {
  name: string;
  onInit(
    pluginContext: PluginContext<E>,
  ): {
    dispose(): void | Promise<void>;
  } | void;
}

export interface ServerOptions<
  E extends Env,
  P extends string = "",
  P1 extends string = ""
> {
  router?: RouterType;
  routes: Route<E, P, P1>[];
  middlewares?: MiddlewareHandler<E>[];
  plugins?: Plugin<E>[];
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
export declare function fetch(request: Request): Promise<Response>;

export { Context };
