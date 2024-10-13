import type { Context, Method, MiddlewareHandler } from "../types";
import type { DynamicSegmentsRemoved, ExtractUrl, RouteMatch } from "./types";

export type HTTPMethod = Method;

export type Route<T = unknown> = {
  method: HTTPMethod;
  path: string;
  data: T;
};

export type SegmentType = "static" | "dynamic" | "wildcard";
export type SegmentNode<T = unknown> = TrieSegmentNode<T> | RadixSegmentNode<T>;

export type MatchedRoute<Routes extends Route[] = Route[], M = boolean> = {
  /**
   * @property matched - A boolean to indicate if the route was matched
   */
  matched: M;
  /**
   * @property method - The HTTP method of the matched route
   */
  method: Routes[number]["method"];
  /**
   * @property route - The url that was matched
   * @example
   * // Given the route "/heroes/:heroName/:action"
   * // and the url "/heroes/spiderman/save"
   * // route will be "/heroes/spiderman/save"
   */
  route: Routes[number]["path"];
  /**
   * @property matched_route - The route that was matched
   * @description This is the route that was matched, it may contain dynamic segments
   * @example
   * // Given the route "/heroes/:heroName/:action"
   * // and the url "/heroes/spiderman/save"
   * // matched_route will be "/heroes/:heroName/:action"
   * // route will be "/heroes/spiderman/save"
   */
  matched_route: string;
  /**
   * @property params - The parameters extracted from the route
   * @example
   * // Given the route "/heroes/:heroName/:action"
   * // and the url "/heroes/spiderman/save"
   * // params will be { heroName: "spiderman", action: "save" }
   */
  params: ExtractUrl<Routes[number]["path"]>["params"] & Record<string, string>;
  /**
   * @property searchParams - The search parameters extracted from the route
   * @description This is the search parameters extracted from the route
   * @example
   * // Given the route "/search"
   * // and the url "/search?q=spiderman"
   * // searchParams will be URLSearchParams("q=spiderman")
   * // route will be "/search?q=spiderman"
   */
  searchParams: URLSearchParams;

  /**
   * @property hash - The hash extracted from the route
   */
  hash: null | string;
  /**
   * @property data - The data associated with the route
   * @description This is the data associated with the route
   */
  data: Routes[number]["data"];

  middlewares: Set<MiddlewareHandler<Context>>; 
};

/**
 * Orders a map of trie segments by type (static, dynamic, wildcard)
 * Orders by precedence: `wildcard > static > dynamic`
 * @param trieMap - A map of the trie segments
 * @returns {Array<[string, TrieSegmentNode]>} - An array of the trie segments ordered by type
 */
export function orderTrieSegmentByType<T>(
  trieMap: Map<string, SegmentNode<T>>
) {
  const orderedSegments: Array<[string, SegmentNode<T>]> = [];
  const dynamicSegments: Array<[string, SegmentNode<T>]> = [];
  const wildcardSegments: Array<[string, SegmentNode<T>]> = [];

  for (const [key, segment] of trieMap) {
    switch (segment.type) {
      case "static":
        orderedSegments.push([key, segment]);
        break;
      case "dynamic":
        dynamicSegments.push([key, segment]);
        break;
      case "wildcard":
        wildcardSegments.push([key, segment]);
        break;
    }
  }

  return [...orderedSegments, ...dynamicSegments, ...wildcardSegments];
}

/**
 * Represents a node in the Radix Tree.
 */
export class RadixSegmentNode<T = unknown> {
  children: Map<string, RadixSegmentNode> = new Map();
  isEndOfRoute: boolean = false;
  data: Record<HTTPMethod, T> = {} as Record<HTTPMethod, T>;
  type: SegmentType = "static";
  paramsKeys: string[] = []; // Keys for dynamic segments
  value: string;
  middlewares: MiddlewareHandler<Context>[] = [];
  previousRadixSegment: RadixSegmentNode | null = null;

  constructor(value: string, type: SegmentType = "static") {
    this.value = value;
    this.type = type;
  }

  /**
   * Inserts a child node or merges existing paths for compactness.
   * @param segment - The path segment to insert.
   * @returns The child node corresponding to the segment.
   */
  insertChild(segment: string, type: SegmentType = "static"): RadixSegmentNode {
    if (!this.children.has(segment)) {
      const child = new RadixSegmentNode(segment, type);
      this.children.set(segment, child);
    }
    return this.children.get(segment)!;
  }
}

export class TrieSegmentNode<T = unknown> {
  /**
   * @property children - A map of the children of the current segment
   */
  children: Map<string, TrieSegmentNode> = new Map();
  /**
   * @property isEndOfRoute - A boolean to indicate if the current segment is the end of a route
   */
  isEndOfRoute: boolean = false;
  /**
   * @property data - A map of HTTP methods to their associated data
   */
  data: Record<HTTPMethod, T> = {} as Record<HTTPMethod, T>;
  /**
   * @property type - The type of the current segment
   */
  type: "static" | "dynamic" | "wildcard" = "static";
  /**
   * @property searchParams - The search parameters associated with the current segment
   */
  searchParams: Record<string, string> = {}; // to be supported later
  /**
   * @property prevTrieSegment - The previous trie segment
   */
  prevTrieSegment: TrieSegmentNode | null = null;

  middlewares: MiddlewareHandler<Context>[] = [];

  constructor(public value: string) {
    this.type = this.determineType(value);
  }


  private determineType(value: string): 'static' | 'dynamic' | 'wildcard' {
    if (value.startsWith(':')) return 'dynamic';
    if (value.startsWith('*')) return 'wildcard';
    return 'static';
  }
}


/**
 * Interface that defines the standard methods for a router.
 */
export interface IRouter<Routes extends Route[] = Route[]> {
  /**
   * Adds a new route to the router.
   * @param route - The route to add.
   */
  addRoute(route: Route<Routes[number]["data"]>): void;

  /**
   * Matches a given URL against the registered routes.
   * @param method - The HTTP method.
   * @param url - The URL to match.
   * @returns The matched route or null if no match is found.
   */
  match<
    RoutePath extends DynamicSegmentsRemoved<Routes[number]["path"]>,
    Matched = RouteMatch<Routes[number]["path"], RoutePath>
  >(
    method: HTTPMethod,
    url: RoutePath
  ): MatchedRoute<Routes, boolean> | null;

  /**
   * Retrieves all registered routes.
   * @returns An array of all routes.
   */
  get routes(): Route<Routes[number]["data"]>[];

  addSubTrie(parent: string, trie: IRouter<Routes>): IRouter<Routes>;

  pushMiddlewares<C extends Context>(
    path: string,
    middleware: MiddlewareHandler<C>[]
  ): void;
}
