import $$path from "path";
import type { Context } from "../context";
import type { InternalHandler, MiddlewareHandler } from "../types";
import {
	type HTTPMethod,
	type IRouter,
	type MatchedRoute,
	RadixSegmentNode,
	type Route,
	type SegmentType,
} from "./base";

/**
 * Radix Tree implementation for route matching.
 */
export class RadixRouteTrie implements IRouter {
	private root = new RadixSegmentNode("/");
	private subTries = new Map<string, RadixRouteTrie>();
	#routes: Set<Route> = new Set();

	/**
	 * Retrieves all registered routes.
	 */
	get routes() {
		return Array.from(this.#routes);
	}

	pushMiddlewares(
		path: string,
		middlewares: MiddlewareHandler<Context>[],
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
		middlewares: MiddlewareHandler<Context>[],
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
				const radixSegment = new RadixSegmentNode(seg);
				radixSegment.previousRadixSegment = currentRadixSegment;
				currentRadixSegment.children.set(seg, radixSegment);
			}

			currentRadixSegment = currentRadixSegment.children.get(seg)!;

			if (isLastSegment) {
				currentRadixSegment.middlewares.push(...middlewares);
			}
		}
	}

	private applyMiddlewareToAllChildren(
		segment: RadixSegmentNode,
		middlewares: MiddlewareHandler<Context>[],
	): void {
		segment.middlewares.push(...middlewares);

		for (const child of segment.children.values()) {
			this.applyMiddlewareToAllChildren(child, middlewares);
		}
	}

	private addGlobalMiddleware(middlewares: MiddlewareHandler<Context>[]): void {
		const applyMiddlewareToSegment = (segment: RadixSegmentNode) => {
			segment.middlewares.push(...middlewares);
			for (const child of segment.children.values()) {
				applyMiddlewareToSegment(child);
			}
		};
		applyMiddlewareToSegment(this.root);
	}

	private collectMiddlewares(node: RadixSegmentNode) {
		const arrays: MiddlewareHandler<Context>[][] = [];
		let current: RadixSegmentNode | null = node;
		let size = 0;
		while (current) {
			if (current.middlewares.length > 0) {
				arrays.push(current.middlewares);
				size += current.middlewares.length;
			}
			current = current.previousRadixSegment;
		}
		const result = new Array<MiddlewareHandler<Context>>(size);
		let idx = 0;
		for (let i = arrays.length - 1; i >= 0; i--) {
			const arr = arrays[i];
			for (let j = 0; j < arr.length; j++) {
				result[idx++] = arr[j];
			}
		}
		return result;
	}

	/**
	 * Adds a new route to the Radix Tree.
	 * @param route - The route to add.
	 */
	addRoute(route: Route): void {
		const { method, path: routePath, handlers } = route;
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
					`Cannot add route "${routePath}" after a wildcard segment. Route will be ignored.`,
				);
				return;
			}
		}

		if (currentNode.isEndOfRoute) {
			console.warn(
				`Route "${routePath}" for method "${method}" is being overwritten.`,
			);
		}

		currentNode.isEndOfRoute = true;
		if (Array.isArray(handlers)) {
			currentNode.handlers[method.toUpperCase() as HTTPMethod] = [
				...this.collectMiddlewares(currentNode),
				...(handlers as InternalHandler<Context>[]),
			];
		} else {
			currentNode.handlers[method.toUpperCase() as HTTPMethod] =
				handlers as InternalHandler<Context>;
		}
		this.#routes.add(route);
	}

	addSubTrie(parent: string, trie: RadixRouteTrie) {
		const sanitizedPath = this.sanitizeRoute(parent);
		if (this.subTries.has(sanitizedPath)) {
			console.warn(
				`SubTrie for path "${sanitizedPath}" already exists. Overwriting...`,
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

	match(method: HTTPMethod, url: string): MatchedRoute | null {
		let sanitizedPath = url;
		if (sanitizedPath.charCodeAt(0) === 47)
			sanitizedPath = sanitizedPath.slice(1);
		if (
			sanitizedPath.length > 0 &&
			sanitizedPath.charCodeAt(sanitizedPath.length - 1) === 47
		) {
			sanitizedPath = sanitizedPath.slice(0, -1);
		}
		const segments = sanitizedPath === "" ? [""] : sanitizedPath.split("/");
		const params: Record<string, string> = {};
		let currentNode = this.root;
		let matchedRoute = "";
		const methodUpper = method.toUpperCase() as HTTPMethod;

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];

			const staticChild = currentNode.children.get(segment);
			if (staticChild && staticChild.type === "static") {
				matchedRoute += `/${staticChild.value}`;
				currentNode = staticChild;
				continue;
			}

			const dynamicChild = currentNode.children.get("*");
			if (dynamicChild && dynamicChild.type === "dynamic") {
				const paramName = dynamicChild.paramsKeys[0];
				params[paramName] = segment;
				matchedRoute += `/${segment}`;
				currentNode = dynamicChild;
				continue;
			}

			let wildcardMatched = false;
			for (const child of currentNode.children.values()) {
				if (child.type === "wildcard") {
					matchedRoute += `/${child.value}`;
					if (child.isEndOfRoute && child.handlers[methodUpper]) {
						const remainingSegments = segments.slice(i).join("/");
						const paramName =
							child.value.length > 1 ? child.value.slice(1) : String(i);
						params[paramName] = remainingSegments;
						return {
							matched: true,
							method,
							route: undefined,
							matched_route: matchedRoute,
							params,
							handlers: child.handlers[methodUpper] as
								| InternalHandler<Context>[]
								| InternalHandler<Context>,
							store: undefined,
							executor: undefined,
							is405: false,
						};
					}
					wildcardMatched = true;
					currentNode = child;
					break;
				}
			}

			if (!wildcardMatched) return null;
		}

		if (currentNode.isEndOfRoute && currentNode.handlers[methodUpper]) {
			return {
				matched: true,
				method,
				route: undefined,
				matched_route: matchedRoute,
				params,
				handlers: currentNode.handlers[methodUpper] as
					| InternalHandler<Context>[]
					| InternalHandler<Context>,
				store: undefined,
				executor: undefined,
				is405: false,
			};
		}

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
}
