import $$path from "node:path";
import {
  orderTrieSegmentByType,
  RadixSegmentNode,
  type HTTPMethod,
  type IRouter,
  type MatchedRoute,
  type RouteDescriptor,
  type SegmentType,
} from "./base";
import type { DynamicSegmentsRemoved, RouteMatch } from "./types";
import type { Context } from "../context";
import type { Env, MiddlewareHandler } from "../types";

/**
 * Radix Tree implementation for route matching.
 */
export class RadixRouteTrie<
E extends Env,
Routes extends RouteDescriptor[]> implements IRouter<E, Routes> {
  private root = new RadixSegmentNode<E>("/");
  private subTries = new Map<string, RadixRouteTrie<E, Routes>>();
  #routes: Set<RouteDescriptor<Routes[number]["data"]>> = new Set();

  /**
   * Retrieves all registered routes.
   */
  get routes() {
    return Array.from(this.#routes);
  }

  pushMiddlewares(
    path: string,
    middlewares: MiddlewareHandler<E>[]
  ): void {
    const sanitizedPath = this.sanitizeRoute(path);

    if (sanitizedPath === "*") {
      for (const route of this.#routes) {
        this.addMiddlewareToPath(route.path, middlewares);
      }
      this.addGlobalMiddleware(middlewares);
    } else {
      this.addMiddlewareToPath(sanitizedPath, middlewares);
    }
  }

  private addMiddlewareToPath(
    path: string,
    middlewares: MiddlewareHandler<E>[]
  ): void {
    const segments = path === "/" ? [path] : path.split("/");
    let currentRadixSegment = this.root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLastSegment = i === segments.length - 1;

      if (seg === "*") {
        this.applyMiddlewareToAllChildren(currentRadixSegment, middlewares);
        break; // Wildcard applies to all subsequent paths
      }

      if (!currentRadixSegment.children.has(seg)) {
        const radixSegment = new RadixSegmentNode<E>(seg);
        radixSegment.previousRadixSegment = currentRadixSegment;
        currentRadixSegment.children.set(seg, radixSegment);
      }

      currentRadixSegment = currentRadixSegment.children.get(seg)!;

      if (isLastSegment) {
        currentRadixSegment.middlewares.push(
          ...(middlewares)
        );
      }
    }
  }

  private applyMiddlewareToAllChildren(
    segment: RadixSegmentNode<E>,
    middlewares: MiddlewareHandler<E>[]
  ): void {
    segment.middlewares.push(...(middlewares as MiddlewareHandler<E>[]));

    for (const child of segment.children.values()) {
      this.applyMiddlewareToAllChildren(child, middlewares);
    }
  }

  private addGlobalMiddleware(
    middlewares: MiddlewareHandler<E>[]
  ): void {
    const applyMiddlewareToSegment = (segment: RadixSegmentNode<E>) => {
      segment.middlewares.push(...(middlewares as MiddlewareHandler<E>[]));
      for (const child of segment.children.values()) {
        applyMiddlewareToSegment(child);
      }
    };
    applyMiddlewareToSegment(this.root);
  }

  private collectMiddlewares<E extends Env>(node: RadixSegmentNode<E, unknown>) {
    const stack: MiddlewareHandler<E>[] = [];
    let current: RadixSegmentNode<E, unknown> | null = node;
    while (current) {
      if (current.middlewares.length > 0) {
        stack.push(...current.middlewares);
      }

      current = current.previousRadixSegment as RadixSegmentNode<E, unknown>;
    }
    // Middlewares should be executed from root to leaf, so reverse the stack
    return stack;
  }

  /**
   * Adds a new route to the Radix Tree.
   * @param route - The route to add.
   */
  addRoute(route: RouteDescriptor<Routes[number]["data"]>): void {
    const { method, path: routePath, data } = route;
    const sanitizedPath = this.sanitizeRoute(routePath);
    const segments = sanitizedPath === "/" ? [""] : sanitizedPath.split("/");

    let currentNode = this.root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLastSegment = i === segments.length - 1;

      // Determine segment type
      let type: SegmentType = "static";
      let segmentKey = segment;

      if (this.isWildcard(segment)) {
        type = "wildcard";
      } else if (this.isDynamic(segment)) {
        type = "dynamic";
        segmentKey = "*"; // Use a placeholder for dynamic segments
      }

      // Insert or retrieve the child node
      const childNode = currentNode.insertChild(segmentKey, type);

      // For dynamic segments, store the parameter name
      if (type === "dynamic") {
        const paramName = segment.slice(1);
        childNode.paramsKeys.push(paramName);
      }

      currentNode = childNode;

      // Prevent adding routes after a wildcard segment
      if (currentNode.type === "wildcard" && !isLastSegment) {
        console.warn(
          `Cannot add route "${routePath}" after a wildcard segment. Route will be ignored.`
        );
        return;
      }
    }

    if (currentNode.isEndOfRoute) {
      console.warn(
        `Route "${routePath}" for method "${method}" is being overwritten.`
      );
    }

    currentNode.isEndOfRoute = true;
    currentNode.data[method.toUpperCase() as HTTPMethod] = data;
    this.#routes.add(route);
  }

  addSubTrie(parent: string, trie: RadixRouteTrie<E, Routes>) {
    const sanitizedPath = this.sanitizeRoute(parent);
    if (this.subTries.has(sanitizedPath)) {
      console.warn(
        `SubTrie for path "${sanitizedPath}" already exists. Overwriting...`
      );
    }
    const routes = trie.routes.map((route) => {
      route.path = $$path.join(sanitizedPath, route.path);
      return route;
    });

    for (const route of routes) {
      this.addRoute(route);
    }

    return this;
  }

  /**
   * Matches a given route against the Radix Tree.
   * @param method - The HTTP method.
   * @param url - The URL to match.
   * @returns The matched route or null if no match is found.
   */
  match<
    RoutePath extends DynamicSegmentsRemoved<Routes[number]["path"]>,
    Matched = RouteMatch<Routes[number]["path"], RoutePath>
  >(method: HTTPMethod, url: RoutePath): MatchedRoute<E, Routes, boolean> | null {
    const { path, searchParams, hash } = this.extractParams(url);
    const sanitizedPath = this.sanitizeRoute(path);
    const segments = sanitizedPath === "/" ? [""] : sanitizedPath.split("/");
    const params: Record<string, string> = {};
    let currentNode = this.root;
    let matchedRoute = "";
    let methodUpper = method.toUpperCase() as HTTPMethod;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      let matched = false;

      // Order children by type: wildcard > static > dynamic
      const orderedChildren = orderTrieSegmentByType(currentNode.children) as [
        string,
        RadixSegmentNode<E, Routes[number]["data"]>
      ][];

      for (const [key, child] of orderedChildren) {
        if (child.type === "wildcard") {
          matchedRoute += `/${child.value}`;
          if (child.isEndOfRoute && child.data[methodUpper]) {
            // Capture remaining segments as wildcard params
            const remainingSegments = segments.slice(i).join("/");
            const paramName =
              child.value.length > 1 ? child.value.slice(1) : String(i);
            params[paramName] = remainingSegments;
            return {
              matched: true,
              method: method,
              route: url,
              matched_route: matchedRoute,
              params: params as any,
              searchParams: new URLSearchParams(searchParams),
              hash: hash || null,
              data: child.data[methodUpper],
              middlewares: new Set(this.collectMiddlewares(child)),
            };
          }
          // Wildcard exists but doesn't have the required method
          continue;
        }

        if (child.type === "static" && child.value === segment) {
          matchedRoute += `/${child.value}`;
          currentNode = child;
          matched = true;
          break;
        }

        if (child.type === "dynamic") {
          const paramName = child.paramsKeys[0];
          params[paramName] = segment;
          matchedRoute += `/${segment}`;
          currentNode = child;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // No matching child found
        return null;
      }
    }

    if (currentNode.isEndOfRoute && currentNode.data[methodUpper]) {
      return {
        matched: true,
        method: method,
        route: url,
        matched_route: matchedRoute,
        params: params as any,
        searchParams: new URLSearchParams(searchParams),
        hash: hash || null,
        data: currentNode.data[methodUpper],
        middlewares: new Set(this.collectMiddlewares(currentNode)),
      };
    }

    // Method not allowed for the matched route
    return null;
  }

  /**
   * Sanitizes a route by removing leading/trailing slashes and encoding URI components.
   * @param route - The route to sanitize.
   * @returns The sanitized route.
   */
  private sanitizeRoute(route: string): string {
    if (route === "/") return "";
    return encodeURI(route.replace(/^\/|\/$/g, ""));
  }

  /**
   * Checks if a segment is dynamic (e.g., ":id").
   * @param segment - The segment to check.
   * @returns True if dynamic, else false.
   */
  private isDynamic(segment: string): boolean {
    return segment.startsWith(":");
  }

  /**
   * Checks if a segment is a wildcard (e.g., "*" or "*path").
   * @param segment - The segment to check.
   * @returns True if wildcard, else false.
   */
  private isWildcard(segment: string): boolean {
    return segment === "*" || segment.startsWith("*");
  }

  /**
   * Extracts the path, search parameters, and hash from a URL.
   * @param url - The URL to extract from.
   * @returns An object containing the path, search parameters, and hash.
   */
  private extractParams(url: string): {
    path: string;
    searchParams: string;
    hash: string;
  } {
    const urlObj = new URL(url, "http://localhost"); // Base URL is required
    return {
      path: urlObj.pathname,
      searchParams: urlObj.search,
      hash: urlObj.hash.slice(1),
    };
  }
}
