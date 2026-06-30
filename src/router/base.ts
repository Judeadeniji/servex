import type {
	Context,
	InternalHandler,
	Method,
	MiddlewareHandler,
} from "../types";

export type HTTPMethod = Method;

export type Route = {
	method: HTTPMethod;
	path: string;
	handlers: InternalHandler[] | InternalHandler;
};

export type SegmentType = "static" | "dynamic" | "wildcard";
export type SegmentNode<T = unknown> = TrieSegmentNode<T> | RadixSegmentNode<T>;

export type MatchedRoute = {
	matched: boolean;
	method: Method | undefined;
	route: Route | undefined;
	matched_route: string | undefined;
	params: Record<string, string> | null;
	/**
	 * Positional array of captured parameter values emitted by the SonicRouter
	 * JIT codegen.  Parallel to `store.paramsKeys`; consumers should build the
	 * keyed `params` object from these two arrays rather than reading `params`
	 * directly when this field is present.
	 */
	paramValues?: string[];
	handlers: InternalHandler<Context>[] | InternalHandler<Context> | undefined;
	middlewares?: MiddlewareHandler<Context>[];
	store?: Record<string, unknown> | undefined;
	executor?:
		| ((
				context: Context,
		  ) => Response | undefined | Promise<Response | undefined>)
		| undefined;
	is405?: boolean;
};

/**
 * Orders a map of trie segments by type (static, dynamic, wildcard)
 * Orders by precedence: `wildcard > static > dynamic`
 * @param trieMap - A map of the trie segments
 * @returns {Array<[string, TrieSegmentNode]>} - An array of the trie segments ordered by type
 */
export function orderTrieSegmentByType<T>(
	trieMap: Map<string, SegmentNode<T>>,
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
	handlers: Record<HTTPMethod, T> = {} as Record<HTTPMethod, T>;
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
			child.previousRadixSegment = this;
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
	 * @property handlers - A map of HTTP methods to their associated handlers
	 */
	handlers: Record<HTTPMethod, T> = {} as Record<HTTPMethod, T>;
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

	private determineType(value: string): "static" | "dynamic" | "wildcard" {
		if (value.startsWith(":")) return "dynamic";
		if (value.startsWith("*")) return "wildcard";
		return "static";
	}
}

/**
 * Interface that defines the standard methods for a router.
 */
export interface IRouter {
	/**
	 * Adds a new route to the router.
	 * @param route - The route to add.
	 */
	addRoute(route: Route): void;

	/**
	 * Matches a given URL against the registered routes.
	 * @param method - The HTTP method.
	 * @param url - The URL to match.
	 * @returns The matched route or null if no match is found.
	 */
	match(method: HTTPMethod, url: string): MatchedRoute | null;

	/**
	 * Retrieves all registered routes.
	 * @returns An array of all routes.
	 */
	get routes(): Route[];

	addSubTrie(parent: string, trie: IRouter): IRouter;

	pushMiddlewares(path: string, middleware: MiddlewareHandler<Context>[]): void;
}
