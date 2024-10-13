import type { Context, MiddlewareHandler } from "../../types";

type CORSOptions = {
  origin:
    | string
    | string[]
    | ((origin: string, c: Context) => string | undefined | null);
  allowMethods?: string[];
  allowHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  exposeHeaders?: string[];
};

export function cors<C extends Context>(
  options?: CORSOptions
): MiddlewareHandler<C> {
  const defaults: CORSOptions = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: [],
    maxAge: undefined,
    credentials: false,
  };

  const opts = { ...defaults, ...options };

  function findAllowOrigin(origin: CORSOptions["origin"], c: Context) {
    if (typeof opts.origin === "string") {
      return opts.origin;
    }

    if (typeof opts.origin === "function") {
      return opts.origin.call(null, origin as string, c);
    }

    return opts.origin.includes(origin as string)
      ? (origin as string)
      : opts.origin[0];
  }

  return async function cors(ctx, next) {
    function set(key: string, value: string) {
      ctx.res.headers.set(key, value);
    }

    const allowOrigin = findAllowOrigin(
      ctx.req.headers.get("origin") || "",
      ctx
    );
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }

    if (opts.origin !== "*") {
      const existingVary = ctx.req.headers.get("Vary");

      if (existingVary) {
        set("Vary", existingVary);
      } else {
        set("Vary", "Origin");
      }
    }

    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }

    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }

    if (ctx.req.method === "OPTIONS") {
      if (opts.maxAge !== null) {
        set("Access-Control-Max-Age", opts.maxAge!.toString());
      }

      if (opts.allowMethods?.length) {
        set("Access-Control-Allow-Methods", opts.allowMethods.join(","));
      }

      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = ctx.req.headers.get(
          "Access-Control-Request-Headers"
        );
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        ctx.res.headers.append("Vary", "Access-Control-Request-Headers");
      }

      ctx.res.headers.delete("Content-Length");
      ctx.res.headers.delete("Content-Type");

      return new Response(null, {
        headers: ctx.res.headers,
        status: 204,
        statusText: ctx.res.statusText,
      });
    }
    await next();
  };
}
