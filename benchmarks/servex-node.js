// src/index.ts
import process2 from "node:process";

// src/cookie/index.ts
function serialize(name, value, options) {
  const encodeFn = options?.encode || encodeURIComponent;
  if (typeof encodeFn !== "function") {
    throw new TypeError("option `encode` must be a function");
  }
  if (!isCookieNameValid(name)) {
    throw new TypeError("argument `name` is invalid");
  }
  const _value = encodeFn(value);
  if (!isCookieValueValid(_value)) {
    throw new TypeError("argument `value` is invalid");
  }
  let cookieString = `${name}=${_value}`;
  if (!options)
    return cookieString;
  if (options.maxAge) {
    const maxAge = Math.floor(options.maxAge);
    if (!isFinite(maxAge)) {
      throw new TypeError("option `maxAge` is invalid");
    }
    cookieString += `; Max-Age=${maxAge}`;
  }
  if (options.domain) {
    if (!isDomainValid(options.domain)) {
      throw new TypeError("option `domain` is invalid");
    }
    cookieString += `; Domain=${options.domain}`;
  }
  if (options.expires) {
    if (!(options.expires instanceof Date)) {
      throw new TypeError("option `expires` is invalid");
    }
    cookieString += `; Expires=${options.expires.toUTCString()}`;
  }
  if (options.httpOnly) {
    cookieString += "; HttpOnly";
  }
  if (options.partitioned) {
    cookieString += "; Partitioned";
  }
  if (options.path) {
    if (!isPathValid(options.path)) {
      throw new TypeError("option `path` is invalid");
    }
    cookieString += `; Path=${options.path}`;
  }
  if (options.sameSite) {
    switch (options.sameSite) {
      case true:
        cookieString += "; SameSite";
        break;
      case "lax":
        cookieString += "; SameSite=Lax";
        break;
      case "strict":
        cookieString += "; SameSite=Strict";
        break;
      case "none":
        cookieString += "; SameSite=None";
        break;
      default:
        throw new TypeError("option `sameSite` is invalid");
    }
  }
  if (options.priority) {
    switch (options.priority) {
      case "Low":
        cookieString += "; Priority=Low";
        break;
      case "Medium":
        cookieString += "; Priority=Medium";
        break;
      case "High":
        cookieString += "; Priority=High";
        break;
      default:
        throw new TypeError("option `priority` is invalid");
    }
  }
  if (options.secure) {
    cookieString += "; Secure";
  }
  return cookieString;
}
function isCookieNameValid(name) {
  return /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name);
}
function isCookieValueValid(value) {
  return /^("?)[\u0021\u0023-\u002B\u002D-\u003A\u003C-\u005B\u005D-\u007E]*\1$/.test(value);
}
function isDomainValid(domain) {
  return /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(domain);
}
function isPathValid(path) {
  return /^[\u0020-\u003A\u003D-\u007E]*$/.test(path);
}

// src/context.ts
import { STATUS_CODES } from "node:http";
function parseHeaders(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

class Context {
  #rawRequest;
  #variables;
  #params;
  #query;
  #body;
  #response = new Response;
  #status = 200;
  #locals = new Map;
  #globals;
  debug = false;
  locals;
  constructor(request, variables, ctx) {
    this.#rawRequest = request;
    this.#variables = variables;
    this.#params = ctx.params;
    this.#query = ctx.query;
    this.#body = ctx.parsedBody;
    this.#globals = ctx.globals;
    const l = (key) => {
      return this.#locals.get(key);
    };
    l.set = (key, value) => {
      this.#locals.set(key, value);
    };
    this.locals = l;
  }
  globals(key) {
    return this.#globals.get(key);
  }
  setHeaders(headers) {
    for (const name in headers) {
      if (Object.prototype.hasOwnProperty.call(headers, name)) {
        const value = headers[name];
        this.#response.headers.append(name, Array.isArray(value) ? value.join(",") : value);
      }
    }
    return this;
  }
  setCookie(name, value, options) {
    const ckStr = serialize(name, value, options);
    this.#response.headers.append("Set-Cookie", ckStr);
    return this;
  }
  setCookies(cookies, options) {
    for (const [name, value] of Object.entries(cookies)) {
      this.setCookie(name, value, options);
    }
    return this;
  }
  get req() {
    return this.#rawRequest;
  }
  get res() {
    return this.#response;
  }
  env() {
    return this.#variables;
  }
  params(k) {
    return typeof k === "string" ? this.#params[k] : this.#params;
  }
  query(q) {
    return q ? this.#query.get(q) : this.#query;
  }
  async formData() {
    if (this.#body === undefined) {
      this.#body = await this.#rawRequest.formData();
    }
    return this.#body;
  }
  async urlEncoded() {
    if (this.#body === undefined) {
      const text = await this.#rawRequest.text();
      this.#body = new URLSearchParams(text);
    }
    return this.#body;
  }
  json(object, status = 200, _headers = {}) {
    const body = JSON.stringify(object);
    const preResponseHeaders = parseHeaders(this.#response.headers);
    const responseHeaders = {
      ...preResponseHeaders,
      "Content-Type": "application/json; charset=UTF-8",
      ..._headers
    };
    const headers = new Headers(responseHeaders);
    this.#status = status;
    this.#response = new Response(body, {
      status,
      headers,
      statusText: STATUS_CODES[status]
    });
    return this.#response;
  }
  text(text, status = 200, _headers = {}) {
    const responseHeaders = {
      "Content-Type": "text/plain; charset=UTF-8",
      ..._headers
    };
    this.#status = status;
    const headers = new Headers(responseHeaders);
    return new Response(text, {
      status,
      headers,
      statusText: STATUS_CODES[status]
    });
  }
  html(html, status = 200, _headers = {}) {
    const responseHeaders = {
      "Content-Type": "text/html; charset=UTF-8",
      ..._headers
    };
    this.#status = status;
    const headers = new Headers(responseHeaders);
    return new Response(html, {
      status,
      headers,
      statusText: STATUS_CODES[status]
    });
  }
  redirect(location, status = 302) {
    this.#status = status;
    return new Response(null, {
      status,
      headers: {
        Location: location
      }
    });
  }
  stream(stream, status = 200, _headers = {}) {
    const preResponseHeaders = parseHeaders(this.#response.headers);
    const responseHeaders = {
      "Content-Type": "text/plain; charset=UTF-8",
      "Transfer-Encoding": "chunked",
      ...preResponseHeaders,
      ..._headers
    };
    this.#status = status;
    const headers = new Headers(responseHeaders);
    return new Response(stream, {
      status,
      headers,
      statusText: STATUS_CODES[status]
    });
  }
  get status() {
    return this.#status;
  }
}

// src/core/request.ts
async function parseRequestBody(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await request.json();
    } catch (error) {
      return new Response("Invalid JSON", { status: 400 });
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const formData = await request.formData();
      const entries = {};
      formData.forEach((v, k) => entries[k] = v);
      return entries;
    } catch (error) {
      return new Response("Invalid form data", { status: 400 });
    }
  } else if (contentType.includes("multipart/form-data")) {
    try {
      return await request.formData();
    } catch (error) {
      return new Response("Invalid multipart form data", { status: 400 });
    }
  } else {
    return null;
  }
}

// src/scope.ts
var currentScope = null;

class Scope {
  router;
  context = null;
  parent;
  constructor(router, parent) {
    this.router = router;
    this.parent = parent || null;
  }
}
function createScope(router) {
  const scope = new Scope(router);
  currentScope = scope;
  return scope;
}
function disposeScope() {
  currentScope = null;
}

// src/basic-handlers.ts
var notFoundHandler = async (context) => {
  return context.text("Not Found", 404);
};

// src/core/response.ts
function handleErrorsGracefully(error) {
  if ("getResponse" in error) {
    return { shouldThrow: false, response: error.getResponse() };
  }
  console.error("Unhandled error:", error);
  return { shouldThrow: true, response: new Response("Internal Server Error", { status: 500 }) };
}
async function executeHandlers(context, handlers, defaultHandler = notFoundHandler) {
  let currentIndex = 0;
  let response;
  const invokeHandler = async (index) => {
    if (index >= handlers.length) {
      return;
    }
    const [[handler, r], params] = handlers[index];
    console.log({ params, r });
    let nextCalled = false;
    try {
      const handleNext = async () => {
        if (nextCalled) {
          throw new Error("next() called multiple times");
        }
        nextCalled = true;
        await invokeHandler(index + 1);
      };
      const result = await handler(context, handleNext);
      if (result instanceof Response) {
        response = result;
      }
    } catch (error) {
      if (error instanceof Error) {
        error.handlerIndex = index;
      }
      throw error;
    }
  };
  try {
    await invokeHandler(currentIndex);
  } catch (error) {
    context.debug && console.error(error);
    const { shouldThrow, response: errorResponse } = handleErrorsGracefully(error);
    if (shouldThrow) {
      throw error;
    }
    return errorResponse;
  }
  if (!response) {
    try {
      response = await defaultHandler(context, async () => {
      });
    } catch (error) {
      context.debug && console.warn(`Error in default handler:`, error);
      const { shouldThrow, response: errorResponse } = handleErrorsGracefully(error);
      if (shouldThrow) {
        throw error;
      }
      return errorResponse;
    }
  }
  return response;
}

// src/router/types.ts
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch", "trace", "connect", "head"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";

class UnsupportedPathError extends Error {
}

// src/router/utils.ts
var checkOptionalParameter = (path) => {
  if (!path.match(/\:.+\?$/)) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var mergePath = (...paths) => {
  let p = "";
  let endsWithSlash = false;
  for (let path of paths) {
    if (p[p.length - 1] === "/") {
      p = p.slice(0, -1);
      endsWithSlash = true;
    }
    if (path[0] !== "/") {
      path = `/${path}`;
    }
    if (path === "/" && endsWithSlash) {
      p = `${p}/`;
    } else if (path !== "/") {
      p = `${p}${path}`;
    }
    if (path === "/" && p === "") {
      p = "/";
    }
  }
  return p;
};

// src/router/reg-exp-router/node.ts
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}

class Node {
  index;
  varIndex;
  children = Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.index !== undefined) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.children[regexpStr];
      if (!node) {
        if (Object.keys(this.children).some((k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR)) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.children[regexpStr] = new Node;
        if (name !== "") {
          node.varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.varIndex]);
      }
    } else {
      node = this.children[token];
      if (!node) {
        if (Object.keys(this.children).some((k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR)) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.children[token] = new Node;
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.children[k];
      return (typeof c.varIndex === "number" ? `(${k})@${c.varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.index === "number") {
      strList.unshift(`#${this.index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
}

// src/router/reg-exp-router/trie.ts
class Trie {
  context = { varIndex: 0 };
  root = new Node;
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0;; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1;i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1;j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.root.insert(tokens, index, paramAssoc, this.context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (typeof handlerIndex !== "undefined") {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (typeof paramIndex !== "undefined") {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
}

// src/router/reg-exp-router/router.ts
var emptyParam = [];
var nullMatcher = [/^$/, [], Object.create(null)];
var wildcardRegExpCache = Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(path === "*" ? "" : `^${path.replace(/\/\*$|([.\\+*[^\]$()])/g, (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)")}\$`);
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie;
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map((route) => [!/\*|\/:/.test(route[0]), ...route]).sort(([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length);
  const staticMap = Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length;i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [
        handlers.map(([h]) => [h, Object.create(null)]),
        emptyParam
      ];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = Object.create(null);
      paramCount -= 1;
      for (;paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length;i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length;j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length;k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path) {
  if (!middleware) {
    return;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return;
}

class RegExpRouter {
  name = "RegExpRouter";
  middleware;
  routes;
  constructor() {
    this.middleware = { [METHOD_NAME_ALL]: Object.create(null) };
    this.routes = { [METHOD_NAME_ALL]: Object.create(null) };
  }
  add(method, path, handler) {
    const { middleware, routes } = this;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach((p) => re.test(p) && routes[m][p].push([handler, paramCount]));
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length;i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match(method, path) {
    clearWildcardRegExpCache();
    const matchers = this.buildAllMatchers();
    this.match = (method2, path2) => {
      const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
      const staticMatch = matcher[2][path2];
      if (staticMatch) {
        return staticMatch;
      }
      const match = path2.match(matcher[0]);
      if (!match) {
        return [[], emptyParam];
      }
      const index = match.indexOf("", 1);
      return [matcher[1][index], match];
    };
    return this.match(method, path);
  }
  buildAllMatchers() {
    const matchers = Object.create(null);
    [...Object.keys(this.routes), ...Object.keys(this.middleware)].forEach((method) => {
      matchers[method] ||= this.buildMatcher(method);
    });
    this.middleware = this.routes = undefined;
    return matchers;
  }
  buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.middleware, this.routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(...Object.keys(r[METHOD_NAME_ALL]).map((path) => [
          path,
          r[METHOD_NAME_ALL][path]
        ]));
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
}

// src/index.ts
class ServeXRequest extends Request {
}

class ServeXPluginManager {
  #plugins;
  #server;
  #disposers = [];
  constructor(server, plugins) {
    this.#plugins = plugins;
    this.#server = server;
  }
  invokePlugins = async (scope) => {
    const disposers = [];
    for (const plugin of this.#plugins) {
      const { name } = plugin;
      try {
        console.log(this.#server.get);
        const ret = await plugin.onInit({
          scope,
          server: this.#server,
          events$: {
            onRequest: (cb) => {
              this.#server.on("server:request", (rc, req) => {
                cb(rc, req);
              });
            },
            onResponse: (cb) => this.#server.on("server:response", (rc, response) => {
              cb(rc, response);
            })
          }
        });
        if (ret) {
          disposers.push(ret.dispose);
        }
      } catch (error) {
        console.error(`[ServeX: ${name}]`, error);
      }
    }
    this.#disposers = disposers;
  };
  dispose = () => {
    for (const disposer of this.#disposers) {
      disposer();
    }
  };
}

class EventManager {
  #events = new Map;
  on(event, handler) {
    const handlers = this.#events.get(event);
    if (handlers) {
      handlers.push(handler);
    } else {
      this.#events.set(event, [handler]);
    }
  }
  off(event, handler) {
    const handlers = this.#events.get(event);
    if (!handlers) {
      return;
    }
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
  async emit(event, ...data) {
    const handlers = this.#events.get(event);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      await handler(...data);
    }
  }
}

class Queue {
  items = [];
  enqueue(fn) {
    this.items.push(fn);
  }
  dequeue() {
    return this.items.pop();
  }
  isEmpty() {
    return this.items.length === 0;
  }
  size() {
    return this.items.length;
  }
  runAll() {
    while (!this.isEmpty()) {
      const fn = this.dequeue();
      if (fn) {
        process2.nextTick(async () => {
          await fn();
        });
      }
    }
  }
}

class ServeX {
  scope;
  #pluginManager;
  #globals = new Map;
  #__env__ = () => process2.env;
  #events = new EventManager;
  routes = [];
  #router = new RegExpRouter;
  #path = "";
  #queue = new Queue;
  #defer = (resolver) => {
    return new Promise((resolve) => {
      this.#queue.enqueue(() => resolver(resolve));
    });
  };
  get;
  post;
  put;
  patch;
  delete;
  trace;
  connect;
  options;
  head;
  all;
  _basePath;
  #pluginResolved = false;
  constructor(options) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          if (typeof handler !== "string") {
            this.addRoute(method, this.#path, handler);
          }
        });
        return this;
      };
    });
    const { plugins = [], basePath = "/" } = options || {};
    this._basePath = basePath;
    this.#pluginManager = new ServeXPluginManager(this, plugins);
    this.scope = createScope(this.#router);
    this.#pluginManager.invokePlugins(this.scope).then(async () => {
      this.#pluginResolved = true;
      await this.#queue.runAll();
    });
  }
  dispatch = async (scope, request, globals) => {
    if (!this.#pluginResolved) {
      return await this.#defer(async (resolve) => {
        resolve(await this._dispatch(scope, request, globals));
      });
    }
    return await this._dispatch(scope, request, globals);
  };
  _dispatch = async (scope, request, globals) => {
    const { method, url } = request;
    const { pathname, searchParams } = new URL(url);
    const [handlers, paramsStash] = scope.router.match(method, pathname);
    function exec(c) {
      return executeHandlers(c, handlers);
    }
    const requestContext = {
      parsedBody: await parseRequestBody(request.clone()),
      params: {},
      query: searchParams,
      globals,
      path: pathname
    };
    await this.#events.emit("server:request", requestContext, request);
    const ctx = new Context(request, this.#__env__(), requestContext);
    const response = await exec(ctx);
    await this.#events.emit("server:response", requestContext, response);
    return response;
  };
  fetch = async (request) => {
    try {
      return await this.dispatch(this.scope, request, this.#globals);
    } catch (error) {
      console.error("Error handling request:", error);
      return new Response("Internal Server Error", { status: 500 });
    } finally {
      disposeScope();
    }
  };
  async request(input, init) {
    return this.fetch(new ServeXRequest(input, init));
  }
  addRoute = (method, path, handler) => {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = { path, method, handler };
    this.#router.add(method, path, [handler, r]);
    this.routes.push(r);
  };
  on = (...args) => this.#events.on(...args);
}
function createServer(options) {
  return new ServeX(options);
}

// src/node/index.ts
import * as nodeHttp from "node:http";
import * as nodeHttps from "node:https";
import * as nodeHttp2 from "node:http2";
function parseHeaders2(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
var noBodyMethods = ["GET", "HEAD"];

class HttpRequest extends nodeHttp.IncomingMessage {
}
function reqToRequest(req, isHttp2) {
  return new Promise((resolve, reject) => {
    if (isHttp2) {
      req = req;
      const chunks = [];
      req.on("data", (chunk) => {
        if (typeof chunk === "string") {
          chunks.push(Buffer.from(chunk));
        } else {
          chunks.push(chunk);
        }
      });
      req.on("error", (err) => {
        reject(err);
      });
      req.on("end", () => {
        const body = noBodyMethods.includes(req.method) ? null : Buffer.concat(chunks);
        const url = new URL(req.url, `${req.headers[":scheme"]}://${req.headers[":authority"]}`);
        const headers = new Headers;
        const reqHeaders = Object(req.headers);
        for (const key in reqHeaders) {
          if (key.startsWith(":"))
            continue;
          headers.append(key, reqHeaders[key]);
        }
        const request = new Request(url, {
          body,
          headers,
          method: req.headers[":method"]
        });
        resolve(request);
      });
    } else {
      const chunks = [];
      req.on("data", (chunk) => {
        chunks.push(chunk);
      });
      req.on("error", (err) => {
        reject(err);
      });
      req.on("end", () => {
        const body = noBodyMethods.includes(req.method) ? null : Buffer.concat(chunks);
        const url = new URL(req.url, `http://${req.headers.host}`);
        const request = new Request(url, {
          body,
          headers: req.headers,
          method: req.method
        });
        resolve(request);
      });
    }
  });
}
function requestHandler(fetcher, isHttp2 = false) {
  return async (req, res) => {
    try {
      const request = await reqToRequest(req, isHttp2);
      const response = await fetcher(request);
      if (isHttp2) {
        const headers = {
          status: response.status,
          ...parseHeaders2(response.headers)
        };
        delete headers["transfer-encoding"];
        res.writeHead(response.status, headers);
      } else {
        res.writeHead(response.status, response.statusText, Object.entries(response.headers));
      }
      if (response.body) {
        const writable = new WritableStream({
          write(chunk) {
            res.write(chunk, console.error);
          },
          close() {
            res.end();
          }
        });
        response.body.pipeTo(writable);
      } else {
        res.end();
      }
    } catch (error) {
      console.error(error);
      if (isHttp2) {
        res.writeHead(500, {
          status: 500
        });
        res.end("Internal Server Error");
      } else {
        res.writeHead(500, "Internal Server Error");
        res.end("Internal Server Error");
      }
    }
  };
}
function createHttpsServer(fetcher, tlsOptions) {
  return nodeHttps.createServer({
    ...tlsOptions,
    joinDuplicateHeaders: true,
    IncomingMessage: HttpRequest
  }, requestHandler(fetcher));
}
function createHttpServer(fetcher) {
  return nodeHttp.createServer({
    joinDuplicateHeaders: true,
    IncomingMessage: HttpRequest
  }, requestHandler(fetcher));
}
function createHttp2Server(fetcher, tlsOptions) {
  return nodeHttp2.createSecureServer({
    ...tlsOptions
  }, requestHandler(fetcher, true));
}
function nodeServer(tls, http2, fetcher, tlsOptions) {
  if (http2) {
    return createHttp2Server(fetcher, tlsOptions);
  } else if (tls) {
    return createHttpsServer(fetcher, tlsOptions);
  } else {
    return createHttpServer(fetcher);
  }
}
function server(fetcher, options) {
  const defaultOptions = {
    tls: false,
    http2: false
  };
  options = { ...defaultOptions, ...options };
  const server2 = nodeServer(options.tls, options.http2, fetcher, options.tlsOptions);
  const listen = (...args) => {
    server2.listen(...args);
  };
  const stop = (callback) => {
    server2.close((err) => {
      if (err) {
        console.error(err);
      }
      if (callback)
        callback();
    });
  };
  process.on("SIGTERM", () => stop(process.exit));
  process.on("SIGINT", () => stop(process.exit));
  return { listen, stop };
}

// benchmarks/base.ts
function base() {
  return new Response("Hello, world");
}
var base_default = {
  fetch: base
};

// benchmarks/servex-node.ts
var server2 = createServer();
server2.get("/", base_default.fetch);
server(server2.fetch).listen(3000, () => {
  console.log("Listening on http://localhost:3000");
});
