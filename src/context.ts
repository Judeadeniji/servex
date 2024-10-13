// ./context.ts
import * as ck from "./cookie";
import type { StatusCode } from "./http-status";
import type { Env, HeaderRecord, JSONValue } from "./types";
import type { ExtractUrl } from "./router/types";

function parseHeaders(headers: Headers): HeaderRecord {
  const result: HeaderRecord = {};
  for (const key in headers.toJSON()) {
    const value = headers.get(key);
    result[key] = value!;
  }
  return result;
}

interface ServeXRequest extends Request {
  json<T = JSONValue>(): Promise<T>;
}

type RequestContext = {
  parsedBody: any;
  params: Record<string, string>;
  query: URLSearchParams;
};

export class Context<
  E extends Env = Env,
  P extends string = "/",
  I extends Record<string, any> = ExtractUrl<P>
> {
  #rawRequest: ServeXRequest;
  #env: E["Bindings"];
  #params: Record<string, string>;
  #query: URLSearchParams;
  #body: any;
  #response: Response = new Response();

  constructor(request: Request, env: E["Bindings"], ctx: RequestContext) {
    this.#rawRequest = request;
    this.#env = env;
    this.#params = ctx.params;
    this.#query = ctx.query;
    this.#body = ctx.parsedBody;
  }

  setHeaders(headers: { [key: string]: string | string[] }) {
    for (const name in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, name)) {
        const value = headers[name];
        this.#response.headers.append(
          name,
          Array.isArray(value) ? value.join(",") : value
        );
      }
    }
    return this;
  }

  setCookie(name: string, value: string, options?: ck.CookieSerializeOptions) {
    const ckStr = ck.serialize(name, value, options);
    this.#response.headers.append("Set-Cookie", ckStr);
    return this;
  }

  setCookies(
    cookies: Record<string, string>,
    options?: ck.CookieSerializeOptions
  ) {
    for (const [name, value] of Object.entries(cookies)) {
      this.setCookie(name, value, options);
    }

    return this;
  }

  /**
   * The original Request object.
   */
  get req() {
    return this.#rawRequest;
  }

  get res() {
    return this.#response;
  }

  /**
   * Environment bindings (e.g., variables, secrets).
   */
  get env(): E["Bindings"] {
    return this.#env;
  }

  /**
   * Route parameters extracted from the URL.
   * @example
   * // URL: /heroes/spiderman
   * // params: { heroName: "spiderman" }
   */
  params<K extends keyof I["params"]>(
    k?: K
  ): K extends string ? string | undefined : Record<string, string> {
    return (typeof k === "string" ? this.#params[k] : this.#params) as any;
  }

  /**
   * Query parameters extracted from the URL.
   * @example
   * // URL: /search?q=spiderman
   * // query: URLSearchParams("q=spiderman")
   */
  query<K extends string>(
    q?: K
  ): K extends string ? string | null : URLSearchParams {
    return (q ? this.#query.get(q) : this.#query) as any;
  }

  /**
   * Parses and returns the request body as form data.
   */
  async formData(): Promise<FormData> {
    if (this.#body === undefined) {
      this.#body = await this.#rawRequest.formData();
    }
    return this.#body;
  }

  /**
   * Parses and returns the request body as URL-encoded data.
   */
  async urlEncoded(): Promise<URLSearchParams> {
    if (this.#body === undefined) {
      const text = await this.#rawRequest.text();
      this.#body = new URLSearchParams(text);
    }
    return this.#body;
  }

  /**
   * Constructs and returns a JSON response.
   * @param object - The JSON-serializable object to return.
   * @param status - Optional HTTP status code (default: 200).
   * @param headers - Optional headers to include in the response.
   */
  json<T extends Record<any, any>>(
    object: T,
    status: StatusCode = 200,
    headers: HeaderRecord = {}
  ): Response {
    const body = JSON.stringify(object);
    const preResponseHeaders = parseHeaders(this.#response.headers);
    const responseHeaders: HeadersInit = {
      ...preResponseHeaders,
      "Content-Type": "application/json; charset=UTF-8",
      ...headers,
    };
    this.#response = new Response(body, { status, headers: responseHeaders });

    return this.#response;
  }

  /**
   * Constructs and returns a text response.
   * @param text - The text to return.
   * @param status - Optional HTTP status code (default: 200).
   * @param headers - Optional headers to include in the response.
   */
  text(
    text: string,
    status: StatusCode = 200,
    headers: HeaderRecord = {}
  ): Response {
    const responseHeaders: HeadersInit = {
      "Content-Type": "text/plain; charset=UTF-8",
      ...headers,
    };
    return new Response(text, { status, headers: responseHeaders });
  }

  /**
   * Constructs and returns an HTML response.
   * @param html - The HTML string to return.
   * @param status - Optional HTTP status code (default: 200).
   * @param headers - Optional headers to include in the response.
   */
  html(
    html: string,
    status: StatusCode = 200,
    headers: HeaderRecord = {}
  ): Response {
    const responseHeaders: HeadersInit = {
      "Content-Type": "text/html; charset=UTF-8",
      ...headers,
    };
    return new Response(html, { status, headers: responseHeaders });
  }

  /**
   * Constructs and returns a redirect response.
   * @param location - The URL to redirect to.
   * @param status - Optional HTTP status code (default: 302).
   */
  redirect(location: string, status: StatusCode = 302): Response {
    return new Response(null, {
      status,
      headers: {
        Location: location,
      },
    });
  }

  /**
   * Constructs and returns a response with a specified status code and message.
   * @param status - The HTTP status code.
   * @param message - The message to include in the response body.
   */
  status(status: StatusCode, message: string = ""): Response {
    return new Response(message, { status });
  }
}
