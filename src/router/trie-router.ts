import $$path from "path";
import type { Coerce, DynamicSegmentsRemoved, RouteMatch } from "./types";
import {
  TrieSegmentNode,
  type HTTPMethod,
  orderTrieSegmentByType,
  type Route,
  type MatchedRoute,
  type IRouter,
} from "./base";

export class TrieRouter<Routes extends Route[]> implements IRouter<Routes> {
  private root = new TrieSegmentNode("/");
  private subTries: Map<string, TrieRouter<Routes>> = new Map();
  #routes = new Set<Route<Routes[number]["data"]>>();

  /**
   * @property routes - A list of all the routes added to the trie
   */
  get routes() {
    return Array.from(this.#routes);
  }

  addSubTrie(path: string, subTrie: TrieRouter<Routes>) {
    const sanitizedPath = this.sanitizeRoute(path);
    if (this.subTries.has(sanitizedPath)) {
      console.warn(
        `SubTrie for path "${sanitizedPath}" already exists. Overwriting...`
      );
    }
    const routes = subTrie.routes.map((route) => {
      route.path = $$path.join(sanitizedPath, route.path);
      return route;
    });

    for (const route of routes) {
      this.addRoute(route);
    }

    return this;
  }

  addRoute(route: Route<Routes[number]["data"]>) {
    const { method, path, data } = route;
    const routeKey = `${method.toUpperCase()} ${path}`;
    if (this.#routes.has(route)) {
      console.warn(`Route ${routeKey} already exists. Overwriting...`);
    }

    const sanitizedRoute = this.sanitizeRoute(path);
    const routeSegments =
      sanitizedRoute === "/" ? [sanitizedRoute] : sanitizedRoute.split("/");
    let currentTrieSegment = this.root;

    for (const seg of routeSegments) {
      if (!this.resolveWildCard(currentTrieSegment, method, seg, path)) break;
      if (!this.resolveDynamicSegment(currentTrieSegment, method, seg, path))
        break;

      if (!currentTrieSegment.children.has(seg)) {
        const trieSegment = new TrieSegmentNode(seg);
        trieSegment.prevTrieSegment = currentTrieSegment;
        currentTrieSegment.children.set(seg, trieSegment);
      }

      const child = currentTrieSegment.children.get(seg)!;

      if (this.isDynamicSegment(seg)) {
        child.type = "dynamic";
      }
      if (this.isWildCard(seg)) {
        child.type = "wildcard";
      }

      currentTrieSegment = child;
    }

    currentTrieSegment.isEndOfRoute = true;
    // Assign data based on the HTTP method
    currentTrieSegment.data[method.toUpperCase() as HTTPMethod] = data!;
    this.#routes.add(route);
    return this;
  }

  private resolveWildCard(
    currentTrieSegment: TrieSegmentNode,
    method: HTTPMethod,
    seg: string,
    route: string
  ): currentTrieSegment is TrieSegmentNode {
    function childHasWildCard(children: Map<string, TrieSegmentNode>): boolean {
      return Array.from(children).some(
        ([key, child]) => child.type === "wildcard"
      );
    }

    if (this.isWildCard(seg) && currentTrieSegment.children.size > 0) {
      // slice of `seg` from `route`
      const lastRoute = route.slice(0, route.indexOf(seg));
      // warn that the route is not added
      console.info(
        `\x1b[33m[WARN]\x1b[0m Wildcard route \x1b[1m\x1b[36m${route}\x1b[0m will override the following routes`,
        this.lookup(lastRoute).map((r) => $$path.join(...r.map((r) => r.value)))
      );

      currentTrieSegment.children.clear();
      return true;
    }
    if (childHasWildCard(currentTrieSegment.children)) {
      let lastTrieSeg = currentTrieSegment.children.get("*")!;
      let lastRoute = lastTrieSeg.value;

      while (lastTrieSeg.prevTrieSegment) {
        lastTrieSeg = lastTrieSeg.prevTrieSegment;
        lastRoute = $$path.join(lastTrieSeg.value, lastRoute);
      }
      // warn that the route is not added
      console.info(
        "\x1b[33m[WARN]\x1b[0m Cannot add a route after a wild card segment",
        `"route": \x1b[1m\x1b[36m${route}\x1b[0m\n`,
        `This route will be ignored, route "${lastRoute?.[0]}" is the last route before the wildcard`
      );
      return false;
    }

    if (currentTrieSegment.type === "wildcard") {
      // try to warn the user, then fix this
      console.info(
        "\x1b[33m[WARN]\x1b[0m Cannot add a route after a wild card segment",
        `"route": \x1b[1m\x1b[36m${route}\x1b[0m`
      );
      return false;
    }
    return true;
  }

  private resolveDynamicSegment(
    currentTrieSegment: TrieSegmentNode,
    method: HTTPMethod,
    seg: string,
    route: string
  ) {
    function childHasDynamicSegment(
      children: Map<string, TrieSegmentNode>
    ): boolean {
      return Array.from(children).some(([, child]) => child.type === "dynamic");
    }

    if (
      this.isDynamicSegment(seg) &&
      childHasDynamicSegment(currentTrieSegment.children) &&
      currentTrieSegment.data[method]
    ) {
      // slice of `seg` from `route`
      const lastRoute = route.slice(0, route.indexOf(seg));
      // warn that the route is not added
      console.info(
        `\x1b[33m[WARN]\x1b[0m Dynamic route \x1b[1m\x1b[36m${route}\x1b[0m might conflict with the following routes`,
        this.lookup(lastRoute).map((r) => "/" + r.map((r) => r.value).join("/"))
      );

      return false;
    }

    return true;
  }

  /**
   * @method lookup - Lookup a route in the trie
   * @param route - The route to lookup
   * @returns {TrieSegmentNode[][]} - A list of all the routes that match the given route
   */
  lookup(route: Routes[number]["path"]) {
    const routes: TrieSegmentNode[][] = [];
    const sanitizedRoute = this.sanitizeRoute(route);
    const routeSegments =
      sanitizedRoute === "/" ? [sanitizedRoute] : sanitizedRoute.split("/");
    let currentTrieSegment = this.root;

    for (const seg of routeSegments) {
      const dynamicChildren = orderTrieSegmentByType(
        currentTrieSegment.children
      ).filter(([key, child]) => key === seg || child.type === "dynamic") as [
        string,
        TrieSegmentNode
      ][];

      if (!dynamicChildren.length) return routes; // No match found

      currentTrieSegment = dynamicChildren[0][1]; // Move to matched child
    }

    this.findAllRoutes(currentTrieSegment, [currentTrieSegment], routes);
    return routes;
  }

  match<
    RoutePath extends DynamicSegmentsRemoved<Routes[number]["path"]>,
    Matched = RouteMatch<Routes[number]["path"], RoutePath>
  >(
    method: HTTPMethod,
    _route: RoutePath
  ): MatchedRoute<Routes, boolean> | null {
    const route = this.sanitizeRoute(_route) as RoutePath;
    const segments = route === "/" ? [route] : route.split("/");
    const matched_route: MatchedRoute<Routes, Matched> = {
      matched: false as Matched,
      method: method,
      route: _route,
      matched_route: "",
      params: {} as any,
      searchParams: new URLSearchParams(),
      data: null!,
      hash: null,
    };

    {
      const lastSegment = segments[segments.length - 1];
      const { hash, searchParams } = this.extractParams(route); // extracts searchparams if any
      // slice of the hash or search params, then replace the last segment
      segments[segments.length - 1] = lastSegment.split("?")[0].split("#")[0];
      matched_route.searchParams = new URLSearchParams(searchParams);
      matched_route.hash = hash;
    }
    return this.matchAll<RoutePath, Matched>(
      matched_route,
      segments,
      method
    ) as MatchedRoute<Routes, boolean> | null;
  }

  private matchAll<
    R extends DynamicSegmentsRemoved<Routes[number]["path"]>,
    Matched = RouteMatch<Routes[number]["path"], R>
  >(
    matched_route: MatchedRoute<Routes, Matched>,
    segments: string[],
    method: HTTPMethod,
    paths: string[] = [segments[0]],
    index: number = 0
  ): Matched extends false
    ? Coerce<MatchedRoute<Routes> & { matched: false }> | null
    : Coerce<MatchedRoute<Routes> & { matched: true }> {
    const nextSegment = segments[index + 1];
    const path = paths.join("/") as R;
    const routes = this.lookup(path);

    if (routes.length === 0) {
      //@ts-ignore
      return null; // No match found
    }

    const route = routes[0][0] as TrieSegmentNode;

    // I don't think this will ever hit
    if (!route) {
      // @ts-ignore
      return matched_route; // No route at current index
    }

    matched_route.matched_route += `/${route.value}`;

    if (!nextSegment && route.isEndOfRoute) {
      if (route.data[method]) {
        matched_route.matched = true as Matched;
        matched_route.data = route.data[method];
        //@ts-ignore
        return matched_route;
      } else {
        // @ts-ignore
        return null; // Method not allowed for this route
      }
    }

    // Check if the next segment is a child of the current route
    if (route.children.has(nextSegment)) {
      // Move to the next segment
      return this.matchAll(
        matched_route,
        segments,
        method,
        [...paths, nextSegment],
        index + 1
      );
    }
    // Handle dynamic segments and wild cards
    if (!nextSegment) {
      //@ts-ignore
      return null; // No match found
    }

    const orderedTrieSegments = orderTrieSegmentByType(route.children);

    for (const [seg, trieSegment] of orderedTrieSegments) {
      // Switch on the current trie segment type of the route child
      switch (trieSegment.type) {
        case "dynamic":
          matched_route.params[seg.slice(1)] = nextSegment;
          return this.matchAll(
            matched_route,
            segments,
            method,
            [...paths, nextSegment],
            index + 1
          );
        case "wildcard":
          const isNamedWildcard = seg.startsWith("*") && seg.length > 1;
          const routeSegArr = this.sanitizeRoute(
            matched_route.matched_route
          ).split("/");
          // segments - routeSegArr = params
          const params = segments.slice(routeSegArr.length);
          // add the params to the matched_route.params
          if (isNamedWildcard) {
            matched_route.params[seg.slice(1)] = params.join("/");
          } else {
            for (let i = 0; i < params.length; i++) {
              matched_route.params[i] = params[i];
            }
          }

          matched_route.matched_route += `/${seg}`;
          if (trieSegment.data[method]) {
            matched_route.matched = true as Matched;
            matched_route.data = trieSegment.data[method];
            //@ts-ignore
            return matched_route;
          }
          continue;

        case "static":
          // do a plain check
          if (seg !== nextSegment) continue;
          return this.matchAll(
            matched_route,
            segments,
            method,
            [...paths, nextSegment],
            index + 1
          );
      }
    }

    // @ts-ignore
    return matched_route;
  }

  private isDynamicSegment(seg: string) {
    return seg.startsWith(":");
  }

  private isWildCard(seg: string) {
    return seg === "*" || seg.startsWith("*"); // unamed & named wildcards
  }

  private findAllRoutes(
    currentTrieSegment: TrieSegmentNode,
    route: TrieSegmentNode[],
    routes: TrieSegmentNode[][]
  ) {
    if (currentTrieSegment.isEndOfRoute) {
      routes.push(route);
    }

    for (const child of currentTrieSegment.children.values()) {
      this.findAllRoutes(child, [...route, child], routes);
    }
  }

  private sanitizeRoute(r: string) {
    if (r === "/") return r;
    return encodeURI(r.replace(/^\/|\/$/g, "")); // Remove leading and trailing slashes
  }

  /**
   * Extracts hash and search parameters from the route
   * @param r
   */
  extractParams(r: string) {
    // Regex to match the hash and search parameters
    const hashRegex = /#(.*)/;
    const searchRegex = /\?(.*?)(#|$)/;

    // Extract the hash
    const hashMatch = r.match(hashRegex);
    const hash = hashMatch ? hashMatch[1] : "";

    // Extract the search parameters
    const searchMatch = r.match(searchRegex);
    const searchParams: Record<string, string> = {};

    if (!searchMatch) return { hash, searchParams };
    const queryString = searchMatch[1];
    const params = queryString.split("&");

    for (const param of params) {
      const [key, value] = param.split("=").map(decodeURIComponent);

      searchParams[key] = value;
    }

    return { hash, searchParams };
  }
}

export function RouteMatcher<T, Routes extends Route<T>[]>(routes: Routes) {
  const route_table = new TrieRouter<Routes>();
  for (const route of routes) {
    route_table.addRoute(route);
  }

  return route_table as Omit<typeof route_table, "addRoute">;
}
