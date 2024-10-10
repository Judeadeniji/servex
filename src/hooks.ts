import { getCurrentScope } from "./scope";
import type { Context } from "./context";

// Define the type for hooks
type Hook<T> = (context: Context) => T;

// Define the hook manager as a Map for user-defined hooks
const hookManager: Map<string, Hook<any>> = new Map();

// Function to register a user-defined hook
export function registerHook<T>(type: string, hook: Hook<T>) {
  hookManager.set(type, hook);
}

// Predefined hooks
export function headers(): Headers {
  const scope = getCurrentScope();
  return scope.context.req.headers!;
}

// Function to parse cookies from a Set-Cookie header value
function parseCookies(cookieString: string): Record<string, string> {
  return cookieString
    .split(",")
    .reduce((cookies: Record<string, string>, cookiePart: string) => {
      const [key, value] = cookiePart.split("=").map((part) => part.trim());
      if (key && value) {
        cookies[key] = value;
      }
      return cookies;
    }, {});
}

export function cookies<K>(k?: K) {
  const scope = getCurrentScope();
  const cookieString = scope.context.req.headers.get("Set-Cookie");

  if (!cookieString) {
    return (k === "" ? {} : "") as K extends string
      ? string
      : Record<string, string>;
  }

  const parsed = parseCookies(cookieString);

  return (typeof k == "string" ? parsed[k] : parsed) as typeof k extends string
    ? string
    : Record<string, string>;
}

export function url(): string {
  const scope = getCurrentScope();
  return scope.context.req.url!;
}

export function query<K extends string>(
  q?: K
): K extends string ? string | null : URLSearchParams {
  const scope = getCurrentScope();
  return scope.context.query(q);
}

export function params<K extends keyof any>(
  p?: K
): K extends string ? string | undefined : Record<string, string> {
  const scope = getCurrentScope();
  return scope.context.params(p as any);
}

export function request() {
  const scope = getCurrentScope();
  return scope.context.req;
}

export function context<C extends Context>() {
  const scope = getCurrentScope();
  return scope.context as C;
}

// Function to invoke any hook
export function invokeHook<T>(type: string): T | undefined {
  const scope = getCurrentScope();

  // Predefined hooks
  switch (type) {
    case "headers":
      return headers() as unknown as T;
    case "cookies":
      return cookies() as unknown as T;
    case "url":
      return url() as unknown as T;
    case "query":
      return query() as unknown as T;
  }

  // User-defined hooks
  const hook = hookManager.get(type);
  return hook ? hook(scope.context!) : undefined;
}
