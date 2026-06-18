import * as ck from "./cookie";
import type { StatusCode } from "./http-status";
import type { Env, HeaderRecord, JSONValue } from "./types";
import type { ExtractUrl } from "./router/types";
import { background, withCancel, type Context as SignalContext } from "./core/signal";

interface ServeXRequest extends Request {
  json<T = JSONValue>(): Promise<T>;
}

type RequestContext = {
  params: Record<string, string>;
};

export class Context<
  E extends Env = Env,
  P extends string = "/",
  I extends Record<string, any> = ExtractUrl<P>
> {
  #rawRequest: ServeXRequest;
  #env: E["Bindings"];
  #params: Record<string, string>;
  #query?: URLSearchParams;
  #body: any;
  #response: Response = new Response();
  #status: StatusCode = 200;
  #variables: Map<string, any> = new Map();
  debug = false;

  #routine: SignalContext;
  #executionCtx?: any;
  #deferred?: Array<() => Promise<any> | any>;

  constructor(request: Request, env: E["Bindings"], ctx: RequestContext, executionCtx?: any) {
    this.#rawRequest = request;
    this.#env = env;
    this.#params = ctx.params;

    const [routine, cancel] = withCancel(background());
    this.#routine = routine;
    this.#executionCtx = executionCtx;
    if (request.signal) {
      request.signal.addEventListener("abort", () => cancel(), { once: true });
    }
  }

  /**
   * Defer a background task to run after the response has been sent to the client.
   * On Cloudflare Workers/Edge, this automatically maps to `executionCtx.waitUntil()`.
   */
  defer(task: () => Promise<any> | any) {
    if (!this.#deferred) this.#deferred = [];
    this.#deferred.push(task);
  }

  get deferred() {
    return this.#deferred;
  }

  get executionCtx() {
    return this.#executionCtx;
  }

  get routine() {
    return this.#routine;
  }

  set routine(ctx: SignalContext) {
    this.#routine = ctx;
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
  params(): Record<string, string>;
  params<K extends keyof I["params"]>(k: K): string;
  params(k: string): string | undefined;
  params(k?: string | keyof I["params"]): Record<string, string> | string | undefined {
    return typeof k === "string" ? this.#params[k as string] : this.#params;
  }

  setParams(params: Record<string, string>) {
    this.#params = params;
    return this;
  }

  /**
   * Set a variable in the context state. Useful for sharing typed data across middlewares.
   */
  set<Key extends keyof E["Variables"]>(key: Key, value: E["Variables"][Key]): void;
  set(key: string, value: unknown): void;
  set(key: string, value: unknown): void {
    this.#variables.set(key, value);
  }

  /**
   * Get a variable from the context state.
   */
  get<Key extends keyof E["Variables"]>(key: Key): E["Variables"][Key];
  get<T>(key: string): T;
  get(key: string): unknown {
    return this.#variables.get(key);
  }

  /**
   * Query parameters extracted from the URL.
   * @example
   * // URL: /search?q=spiderman
   * // query: URLSearchParams("q=spiderman")
   */
  query(): URLSearchParams;
  query(q: string): string | null;
  query(q?: string): string | null | URLSearchParams {
    if (!this.#query) {
      const searchIndex = this.#rawRequest.url.indexOf("?");
      if (searchIndex !== -1) {
        this.#query = new URLSearchParams(this.#rawRequest.url.slice(searchIndex));
      } else {
        this.#query = new URLSearchParams();
      }
    }
    return q ? this.#query.get(q) : this.#query;
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
  json<T extends Record<any, any> | Array<any>, U extends StatusCode = 200>(
    object: T,
    status?: U,
    _headers: HeaderRecord = {}
  ): Response & import("./types").TypedResponse<T, U, "json"> {
    const body = JSON.stringify(object);
    const headers = this.#response.headers;
    headers.set("Content-Type", "application/json; charset=UTF-8");
    for (const key in _headers) {
      const val = _headers[key];
      headers.set(key, Array.isArray(val) ? val.join(",") : val);
    }

    this.#status = status ?? 200;
    this.#response = new Response(body, { status: status ?? 200, headers });
    return this.#response as Response & import("./types").TypedResponse<T, U, "json">;
  }

  /**
   * Constructs and returns a text response.
   * @param text - The text to return.
   * @param status - Optional HTTP status code (default: 200).
   * @param headers - Optional headers to include in the response.
   */
  text<T extends string, U extends StatusCode = 200>(
    text: T,
    status?: U,
    _headers: HeaderRecord = {}
  ): Response & import("./types").TypedResponse<T, U, "text"> {
    const headers = this.#response.headers;
    headers.set("Content-Type", "text/plain; charset=UTF-8");
    for (const key in _headers) {
      const val = _headers[key];
      headers.set(key, Array.isArray(val) ? val.join(",") : val);
    }

    this.#status = status ?? 200;
    this.#response = new Response(text, { status: status ?? 200, headers });
    return this.#response as Response & import("./types").TypedResponse<T, U, "text">;
  }

  /**
   * Constructs and returns an HTML response.
   * @param html - The HTML string to return.
   * @param status - Optional HTTP status code (default: 200).
   * @param headers - Optional headers to include in the response.
   */
  html<T extends string, U extends StatusCode = StatusCode>(
    html: T,
    status?: U,
    _headers: HeaderRecord = {}
  ): Response & import("./types").TypedResponse<T, U, "html"> {
    const headers = this.#response.headers;
    headers.set("Content-Type", "text/html; charset=UTF-8");
    for (const key in _headers) {
      const val = _headers[key];
      headers.set(key, Array.isArray(val) ? val.join(",") : val);
    }

    this.#status = status ?? 200;
    this.#response = new Response(html, { status: status ?? 200, headers });
    return this.#response as Response & import("./types").TypedResponse<T, U, "html">;
  }

  /**
   * Constructs and returns a redirect response.
   * @param location - The URL to redirect to.
   * @param status - Optional HTTP status code (default: 302).
   */
  redirect(location: string, status: StatusCode = 302): Response {
    const headers = this.#response.headers;
    headers.set("Location", location);
    this.#status = status;
    this.#response = new Response(null, { status, headers });
    return this.#response;
  }

  /**
   * Constructs and returns a streaming response.
   * @param stream - The ReadableStream to return.
   * @param status - Optional HTTP status code (default: 200).
   * @param headers - Optional headers to include in the response.
   */
  stream(
    stream: ReadableStream,
    status: StatusCode = 200,
    _headers: HeaderRecord = {}
  ): Response {
    const headers = this.#response.headers;
    headers.set("Content-Type", "text/plain; charset=UTF-8");
    headers.set("Transfer-Encoding", "chunked");
    for (const key in _headers) {
      const val = _headers[key];
      headers.set(key, Array.isArray(val) ? val.join(",") : val);
    }

    this.#status = status;
    this.#response = new Response(stream, { status, headers });
    return this.#response;
  }

  get status() {
    return this.#status;
  }
}
