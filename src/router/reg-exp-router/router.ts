import type { ParamIndexMap, Result, Router } from "../types";
import {
  MESSAGE_MATCHER_IS_ALREADY_BUILT,
  METHOD_NAME_ALL,
  UnsupportedPathError,
} from "../types";
import { checkOptionalParameter } from "../utils";
import { PATH_ERROR } from "./node";
import type { ParamAssocArray } from "./node";
import { Trie } from "./trie";

type HandlerData<T> = [T, ParamIndexMap][];
type StaticMap<T> = Record<string, Result<T>>;
type Matcher<T> = [RegExp, HandlerData<T>[], StaticMap<T>];
type HandlerWithMetadata<T> = [T, number]; // [handler, paramCount]
type MethodMatcherMap<T> = Map<string, Matcher<T>>;

// Constant values
const EMPTY_PARAM: string[] = [];
const NULL_MATCHER: Matcher<any> = [/^$/, [], Object.create(null)];
const WILDCARD_PATTERN = /\/\*$|([.\\+*[^\]$()])/g;
const PARAM_PATTERN = /\/:/g;
const WILDCARD_END = /\*$/;

// Optimized wildcard RegExp cache using Map for better performance
const wildcardRegExpCache = new Map<string, RegExp>();

// Pre-compile commonly used RegExps
const STATIC_PATH_CHECK = /\*|\/:/;

function buildMatcherFromPreprocessedRoutes<T>(
  routes: [string, HandlerWithMetadata<T>[]][]
): Matcher<T> {
  const trie = new Trie();
  const handlerData: HandlerData<T>[] = [];
  if (routes.length === 0) {
    return NULL_MATCHER;
  }

  const routesWithStaticPathFlag = routes
    .map(
      (route) =>
        [!STATIC_PATH_CHECK.test(route[0]), ...route] as [
          boolean,
          string,
          HandlerWithMetadata<T>[]
        ]
    )
    .sort(([isStaticA, pathA], [isStaticB, pathB]) =>
      isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
    );

  const staticMap: StaticMap<T> = Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [
        handlers.map(([h]) => [h, Object.create(null)]),
        EMPTY_PARAM,
      ];
    } else {
      j++;
    }

    let paramAssoc: ParamAssocArray;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }

    if (pathErrorCheckOnly) {
      continue;
    }

    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap: ParamIndexMap = Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }

  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len = handlerData[i].length; j < len; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len = keys.length; k < len; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }

  const handlerMap: HandlerData<T>[] = [];
  // using `in` because indexReplacementMap is a sparse array
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }

  return [regexp, handlerMap, staticMap] as Matcher<T>;
}

class RegExpRouter<T> implements Router<T> {
  readonly name: string = "RegExpRouter";
  #middleware?: Map<string, Map<string, HandlerWithMetadata<T>[]>>;
  #routes?: Map<string, Map<string, HandlerWithMetadata<T>[]>>;
  #matcherCache: MethodMatcherMap<T>;
  #compiledMatchers: boolean = false;

  constructor() {
    // Use Map instead of object for better performance with string keys
    this.#middleware = new Map([[METHOD_NAME_ALL, new Map()]]);
    this.#routes = new Map([[METHOD_NAME_ALL, new Map()]]);
    this.#matcherCache = new Map();
  }

  // Optimized wildcard RegExp builder
  static #buildWildcardRegExp(path: string): RegExp {
    let regexp = wildcardRegExpCache.get(path);
    if (!regexp) {
      regexp = new RegExp(
        path === "*"
          ? ""
          : `^${path.replace(WILDCARD_PATTERN, (_, metaChar) =>
              metaChar ? `\\${metaChar}` : "(?:|/.*)"
            )}$`
      );
      wildcardRegExpCache.set(path, regexp);
    }
    return regexp;
  }

  // Optimized middleware finder
  static #findMiddleware<T>(
    middleware: Map<string, HandlerWithMetadata<T>[]> | undefined,
    path: string
  ): HandlerWithMetadata<T>[] | undefined {
    if (!middleware) return undefined;

    // Sort keys by length once and cache
    const sortedKeys = [...middleware.keys()].sort((a, b) => b.length - a.length);
    for (const k of sortedKeys) {
      if (RegExpRouter.#buildWildcardRegExp(k).test(path)) {
        return [...middleware.get(k)!];
      }
    }
    return undefined;
  }

  add(method: string, path: string, handler: T): void {
    if (this.#compiledMatchers) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }

    const middleware = this.#middleware!;
    const routes = this.#routes!;

    // Initialize method maps if they don't exist
    if (!middleware.has(method)) {
      for (const handlerMap of [middleware, routes]) {
        const methodMap = new Map();
        const allMethodHandlers = handlerMap.get(METHOD_NAME_ALL)!;
        
        // Copy all method handlers
        for (const [p, handlers] of allMethodHandlers) {
          methodMap.set(p, [...handlers]);
        }
        
        handlerMap.set(method, methodMap);
      }
    }

    // Normalize path
    path = path === "/*" ? "*" : path;
    const paramCount = (path.match(PARAM_PATTERN) || []).length;

    if (WILDCARD_END.test(path)) {
      this.#addWildcardRoute(method, path, handler, paramCount);
      return;
    }

    this.#addStaticRoute(method, path, handler, paramCount);
  }

  // Separated wildcard route addition for clarity and optimization
  #addWildcardRoute(method: string, path: string, handler: T, paramCount: number): void {
    const re = RegExpRouter.#buildWildcardRegExp(path);
    const middleware = this.#middleware!;
    const routes = this.#routes!;

    // Handle middleware for all methods if needed
    if (method === METHOD_NAME_ALL) {
      for (const [m, handlers] of middleware) {
        if (!handlers.has(path)) {
          handlers.set(
            path,
            RegExpRouter.#findMiddleware(handlers, path) ||
              RegExpRouter.#findMiddleware(middleware.get(METHOD_NAME_ALL), path) ||
              []
          );
        }
      }
    } else {
      const methodMiddleware = middleware.get(method)!;
      if (!methodMiddleware.has(path)) {
        methodMiddleware.set(
          path,
          RegExpRouter.#findMiddleware(methodMiddleware, path) ||
            RegExpRouter.#findMiddleware(middleware.get(METHOD_NAME_ALL), path) ||
            []
        );
      }
    }

    // Add handler to matching routes
    for (const [m, methodRoutes] of routes) {
      if (method === METHOD_NAME_ALL || method === m) {
        for (const [p, handlers] of methodRoutes) {
          if (re.test(p)) {
            handlers.push([handler, paramCount]);
          }
        }
      }
    }
  }

  // Separated static route addition
  #addStaticRoute(method: string, path: string, handler: T, paramCount: number): void {
    const paths = checkOptionalParameter(path) || [path];
    const routes = this.#routes!;
    const middleware = this.#middleware!;

    for (let i = 0; i < paths.length; i++) {
      const currentPath = paths[i];
      
      for (const [m, methodRoutes] of routes) {
        if (method === METHOD_NAME_ALL || method === m) {
          if (!methodRoutes.has(currentPath)) {
            methodRoutes.set(
              currentPath,
              [
                ...(RegExpRouter.#findMiddleware(middleware.get(m), currentPath) ||
                  RegExpRouter.#findMiddleware(middleware.get(METHOD_NAME_ALL), currentPath) ||
                  []),
              ]
            );
          }
          methodRoutes.get(currentPath)!.push([handler, paramCount - paths.length + i + 1]);
        }
      }
    }
  }

  match(method: string, path: string): Result<T> {
    if (!this.#compiledMatchers) {
      this.#buildAllMatchers();
      this.#compiledMatchers = true;
    }

    const matcher = this.#matcherCache.get(method) || this.#matcherCache.get(METHOD_NAME_ALL);
    if (!matcher) return [[], EMPTY_PARAM];

    // Check static routes first
    const staticMatch = matcher[2][path];
    if (staticMatch) return staticMatch;

    // Then check dynamic routes
    const match = path.match(matcher[0]);
    if (!match) return [[], EMPTY_PARAM];

    const index = match.indexOf("", 1);
    return [matcher[1][index], match];
  }

  

  // Optimized matcher building
  #buildAllMatchers(): void {
    const methodsToProcess = new Set([
      ...this.#routes!.keys(),
      ...this.#middleware!.keys(),
    ]);

    for (const method of methodsToProcess) {
      if (!this.#matcherCache.has(method)) {
        const matcher = this.#buildMatcher(method);
        if (matcher) {
          this.#matcherCache.set(method, matcher);
        }
      }
    }

    // Clear references to allow garbage collection
    this.#middleware = undefined;
    this.#routes = undefined;
  }

  #buildMatcher(method: string): Matcher<T> | null {
    const routes: [string, HandlerWithMetadata<T>[]][] = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;

    for (const handlerMap of [this.#middleware!, this.#routes!]) {
      const methodHandlers = handlerMap.get(method);
      if (methodHandlers?.size) {
        hasOwnRoute = true;
        routes.push(...Array.from(methodHandlers.entries()));
      } else if (method !== METHOD_NAME_ALL) {
        const allMethodHandlers = handlerMap.get(METHOD_NAME_ALL);
        if (allMethodHandlers?.size) {
          routes.push(...Array.from(allMethodHandlers.entries()));
        }
      }
    }

    return hasOwnRoute ? buildMatcherFromPreprocessedRoutes(routes) : null;
  }
}

export { RegExpRouter };