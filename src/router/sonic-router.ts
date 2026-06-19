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
 * SonicRouter is an ultra-fast RegExp-based router implementation.
 * It compiles dynamic routes into a single large Regular Expression, delegating
 * route matching to the highly optimized C++ V8 regex engine.
 */
export class SonicRouter<Routes extends Route[] = Route[]> implements IRouter<Routes> {
  private _routes: Route<Routes[number]["data"]>[] = [];
  
  // staticRoutes[method][path] -> node
  private staticRoutes: Record<string, Record<string, SonicRouteNode>> = {};
  
  // dynamicRoutes[method] -> array of nodes
  private dynamicRoutes: Record<string, SonicRouteNode[]> = {};
  
  // compiledRegex[method] -> RegExp
  private matchers: Record<string, RegExp> = {};
  
  // map from capture group index -> route node
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

    const routes = this.dynamicRoutes[method] || [];
    if (routes.length === 0) return;

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

  match<
    RoutePath extends DynamicSegmentsRemoved<Routes[number]["path"]>,
    Matched = RouteMatch<Routes[number]["path"], RoutePath>
  >(method: HTTPMethod, url: RoutePath): MatchedRoute<Routes, boolean> | null {
    const rawSanitized = this.sanitizeRoute(url as string);
    const sanitized = rawSanitized === "" ? "/" : rawSanitized;

    // 1. Static fast path (O(1))
    if (this.staticRoutes[method] && this.staticRoutes[method][sanitized]) {
      const node = this.staticRoutes[method][sanitized];
      if (!node.staticMatchResult) {
        node.staticMatchResult = this.buildResult(node, method, url as string, sanitized, {});
      }
      return node.staticMatchResult;
    }

    // 2. Dynamic RegExp evaluation
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
