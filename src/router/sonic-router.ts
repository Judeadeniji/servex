import type { Context, Method, MiddlewareHandler } from "../types";
import type { HTTPMethod, IRouter, MatchedRoute, Route } from "./base";
import type { DynamicSegmentsRemoved, RouteMatch } from "./types";
import * as $$path from "node:path";

type SonicRouteNode = {
  method: HTTPMethod;
  path: string;
  data: any;
  paramsKeys: string[];
  middlewares: MiddlewareHandler<Context>[];
  staticMatchResult?: any;
};

/**
 * Specificity rank for a single path segment.
 * Lower rank = more specific = should be tried first in matching.
 *
 *   0 -> static segment      e.g. "users"
 *   1 -> named param         e.g. ":id"
 *   2 -> wildcard / catch-all e.g. "*rest"
 */
function segmentRank(segment: string): 0 | 1 | 2 {
  if (segment.startsWith(":")) return 1;
  if (segment.startsWith("*")) return 2;
  return 0;
}

/**
 * Compares two dynamic route nodes for matching precedence.
 *
 * Rule: walk both paths segment-by-segment, left to right. The first
 * segment where the two routes differ in specificity (static < param <
 * wildcard) decides the winner — that route is considered "more specific"
 * and must be tried first in the compiled regex alternation.
 *
 * If every compared segment ties (identical shape up to the shorter
 * path's length), the longer path wins (more literal constraints = more
 * specific). A true tie (identical segment-rank shape and length) returns
 * 0, in which case Array.prototype.sort's stability preserves whichever
 * route was registered first — this is the only case where registration
 * order still matters, and it's an intentional, documented fallback for
 * genuinely ambiguous routes.
 *
 * Returns a negative number if `a` is more specific than `b` (should sort
 * earlier), positive if `b` is more specific, 0 for a true tie.
 */
function compareRouteSpecificity(a: SonicRouteNode, b: SonicRouteNode): number {
  const aSegs = a.path === "" ? [""] : a.path.split("/");
  const bSegs = b.path === "" ? [""] : b.path.split("/");
  const len = Math.min(aSegs.length, bSegs.length);

  for (let i = 0; i < len; i++) {
    const ra = segmentRank(aSegs[i]);
    const rb = segmentRank(bSegs[i]);
    if (ra !== rb) return ra - rb;
  }

  if (aSegs.length !== bSegs.length) {
    // Longer path = more literal segments pinned down = more specific.
    // Sorting it earlier means it's tried first.
    return bSegs.length - aSegs.length;
  }

  return 0;
}

/**
 * SonicRouter is an ultra-fast RegExp-based router implementation.
 * It compiles dynamic routes into a single large Regular Expression, delegating
 * route matching to the highly optimized C++ V8 regex engine.
 *
 * Matching precedence for fully-static paths is handled structurally: any
 * route with no ":" or "*" segments is stored in `staticRoutes` and is
 * always checked first via O(1) hash lookup before the dynamic regex is
 * even consulted — so static routes always win over dynamic ones by
 * construction, with no extra logic required.
 *
 * Precedence *among* dynamic routes (param vs param, param vs wildcard,
 * etc.) is resolved explicitly at compile time by `compareRouteSpecificity`
 * — see that function for the rule. This replaces the previous behavior,
 * where dynamic routes were tried in raw registration order, which made
 * matching outcomes depend on the order `addRoute` happened to be called.
 */
export class SonicRouter<Routes extends Route[] = Route[]> implements IRouter<Routes> {
  private _routes: Route<Routes[number]["data"]>[] = [];

  // staticRoutes[method][path] -> node
  private staticRoutes: Record<string, Record<string, SonicRouteNode>> = {};

  // dynamicRoutes[method] -> array of nodes, in raw registration order.
  // Compile-time specificity sorting happens on a *copy* of this array in
  // compile(), so registration order is preserved here for introspection
  // (e.g. `routes` getter, debugging) even though match order differs.
  private dynamicRoutes: Record<string, SonicRouteNode[]> = {};

  // compiledRegex[method] -> RegExp
  private matchers: Record<string, RegExp> = {};

  // map from capture group index -> route node (built from the
  // specificity-sorted route order, not registration order)
  private matchMaps: Record<string, Array<SonicRouteNode | undefined>> = {};

  private isDirty: Record<string, boolean> = {};

  private pathMiddlewares: { path: string, middlewares: MiddlewareHandler<Context>[] }[] = [];

  constructor() {}

  get routes(): Route<Routes[number]["data"]>[] {
    return this._routes;
  }

  addRoute(route: Route<Routes[number]["data"]>): void {
    this._routes.push(route);
    const { method, path, data } = route;
    const sanitizedPath = this.sanitizeRoute(path);

    const isDynamic = sanitizedPath.includes(":") || sanitizedPath.includes("*");

    const node: SonicRouteNode = {
      method,
      path: sanitizedPath,
      data,
      paramsKeys: [],
      middlewares: [],
    };

    for (const pm of this.pathMiddlewares) {
      if (pm.path === "*" || pm.path === "" || sanitizedPath.startsWith(pm.path)) {
        node.middlewares.push(...pm.middlewares);
      }
    }

    if (isDynamic) {
      if (!this.dynamicRoutes[method]) this.dynamicRoutes[method] = [];

      const parts = sanitizedPath === "" ? [""] : sanitizedPath.split("/");
      for (const p of parts) {
        if (p.startsWith(":")) {
          node.paramsKeys.push(p.slice(1));
        } else if (p.startsWith("*")) {
          node.paramsKeys.push(p.length > 1 ? p.slice(1) : "path");
        }
      }
      this.dynamicRoutes[method].push(node);
      this.isDirty[method] = true;
    } else {
      if (!this.staticRoutes[method]) this.staticRoutes[method] = {};
      this.staticRoutes[method][sanitizedPath === "" ? "/" : sanitizedPath] = node;
    }
  }

  private compile(method: string) {
    if (!this.isDirty[method]) return;
    this.isDirty[method] = false;

    const rawRoutes = this.dynamicRoutes[method] || [];
    if (rawRoutes.length === 0) return;

    // Sort a COPY by specificity for matching order. We never mutate
    // this.dynamicRoutes[method] itself, so registration order is still
    // available for anything that introspects the router (route listing,
    // debugging tools, etc.) — only the compiled regex alternation order
    // changes.
    const routes = rawRoutes.slice().sort(compareRouteSpecificity);

    let regexStr = "^(?:";
    const map: Array<SonicRouteNode | undefined> = [];
    let groupIndex = 1;

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      let pattern = "";
      const segments = route.path === "" ? [""] : route.path.split("/");

      let paramsCount = 0;
      for (let j = 0; j < segments.length; j++) {
        const seg = segments[j];
        if (seg.startsWith(":")) {
          pattern += (j === 0 ? "([^/]+)" : "/([^/]+)");
          paramsCount++;
        } else if (seg.startsWith("*")) {
          pattern += (j === 0 ? "(.*)" : "/(.*)");
          paramsCount++;
        } else {
          pattern += (j === 0 ? seg : "/" + seg);
        }
      }

      if (pattern === "") pattern = "/";

      // Wrap route in capturing group
      regexStr += `(${pattern})`;
      map[groupIndex] = route;

      groupIndex += 1 + paramsCount;

      if (i < routes.length - 1) regexStr += "|";
    }
    regexStr += ")$";

    this.matchers[method] = new RegExp(regexStr);
    this.matchMaps[method] = map;
  }

  match<RoutePath extends DynamicSegmentsRemoved<Routes[number]["path"]>>(method: HTTPMethod, url: RoutePath): MatchedRoute<Routes, boolean> | null {
    const rawSanitized = this.sanitizeRoute(url as string);
    const sanitized = rawSanitized === "" ? "/" : rawSanitized;

    // 1. Static fast path (O(1)) — always wins over any dynamic route,
    //    by construction, since we never even reach the regex below.
    if (this.staticRoutes[method] && this.staticRoutes[method][sanitized]) {
      const node = this.staticRoutes[method][sanitized];
      if (!node.staticMatchResult) {
        node.staticMatchResult = this.buildResult(node, method, url as string, sanitized, {});
      }
      return node.staticMatchResult;
    }

    // 2. Dynamic RegExp evaluation, in specificity order (static-segment
    //    > param-segment > wildcard-segment, resolved left-to-right —
    //    see compareRouteSpecificity).
    this.compile(method);
    const regex = this.matchers[method];
    if (regex) {
      const match = regex.exec(sanitized);
      if (match) {
        const map = this.matchMaps[method];
        // Scan for the wrapping group that matched
        for (let i = 1; i < match.length; i++) {
          const node = map[i];
          if (node && match[i] !== undefined) {
            const params: Record<string, string> = {};
            for (let k = 0; k < node.paramsKeys.length; k++) {
              // The params follow sequentially after the wrapping group
              params[node.paramsKeys[k]] = match[i + 1 + k];
            }
            return this.buildResult(node, method, url as string, node.path, params);
          }
        }
      }
    }
    return null;
  }

  private buildResult(
    node: SonicRouteNode,
    method: HTTPMethod,
    url: string,
    matchedRoute: string,
    params: Record<string, string>
  ): MatchedRoute<Routes, boolean> {
    return {
      matched: true,
      method,
      route: url as Routes[number]["path"],
      matched_route: matchedRoute,
      params: params as any,
      data: node.data,
      middlewares: node.middlewares,
      store: node,
    };
  }

  addSubTrie(parent: string, trie: IRouter<Routes>): IRouter<Routes> {
    const sanitizedPath = this.sanitizeRoute(parent);
    const routes = trie.routes.map((route) => {
      route.path = $$path.join(sanitizedPath, route.path);
      return route;
    });

    for (const route of routes) {
      this.addRoute(route);
    }
    return this;
  }

  pushMiddlewares<C extends Context>(path: string, middlewares: MiddlewareHandler<C>[]): void {
    const sanitized = this.sanitizeRoute(path);
    this.pathMiddlewares.push({ path: sanitized, middlewares: middlewares as any });

    if (sanitized === "*" || sanitized === "") {
      for (const method in this.staticRoutes) {
        for (const p in this.staticRoutes[method]) {
          this.staticRoutes[method][p].middlewares.push(...middlewares as any);
        }
      }
      for (const method in this.dynamicRoutes) {
        for (const node of this.dynamicRoutes[method]) {
          node.middlewares.push(...middlewares as any);
        }
      }
    } else {
      for (const method in this.staticRoutes) {
        if (this.staticRoutes[method][sanitized]) {
          this.staticRoutes[method][sanitized].middlewares.push(...middlewares as any);
        }
      }
      for (const method in this.dynamicRoutes) {
         for (const node of this.dynamicRoutes[method]) {
            if (node.path.startsWith(sanitized)) {
               node.middlewares.push(...middlewares as any);
            }
         }
      }
    }
  }

  private sanitizeRoute(route: string): string {
    if (route === "/") return "";
    return encodeURI(route.replace(/^\/|\/$/g, ""));
  }
}
