import { Context } from "./context";
import { createServer } from "../index";
import type { RouterRoute } from "./router/types";

import type { Scope } from "./scope";
import type { ServeX } from ".";

type Bindings = object;
type Variables = object;
type Globals = object;

export declare namespace ServeXInterface {
  export interface Env {
    Bindings?: Bindings;
    Variables?: Variables;
    Globals?: Globals;
  }
}

export type Env = ServeXInterface.Env;

export type RequestContext<E extends Env> = {
  routeId: string;
  params: Record<string, string>;
  query: URLSearchParams;
  globals: Map<keyof E["Globals"], E["Globals"][keyof E["Globals"]]>;
  path: string;
};

export type Handler<E extends Env, P extends string = string> =
  | MiddlewareHandler<E, P>
  | RequestHandler<E, P>;

export type RequestHandler<E extends Env, P extends string> = (
  ctx: Context<E, P>,
  next: NextFunction
) => Promise<Response> | Response;

export type MiddlewareHandler<E extends Env, P extends string = "/"> = (
  ctx: Context<E, P>,
  next: NextFunction
) => Promise<void | undefined | Response> | void | undefined | Response;

export type PluginContext<
  E extends Env = Env,
  T = [Handler<E>, RouterRoute<E>]
> = {
  scope: Scope<E, T>;
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
  onInit(pluginContext: PluginContext<E>):
    | {
        dispose(): void | Promise<void>;
      }
    | void
    | Promise<{
        dispose(): void | Promise<void>;
      } | void>;
}

export interface ServerOptions<E extends Env> {
  plugins?: Plugin<E>[];
  basePath?: string;
}

// http methods
export type HTTPMethod =
  | "get"
  | "post"
  | "put"
  | "delete"
  | "patch"
  | "head"
  | "options"
  | "trace"
  | "connect";

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

export type NextFunction = () => Promise<void>;
export declare function fetch(request: Request): Promise<Response>;

export { Context };
