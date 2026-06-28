import type { Handler } from "../src/types";
import { describe, expect, it } from "bun:test";
import { SonicRouter } from "../src/router/sonic-router";

describe("SonicRouter - Precedence & Specificity", () => {
	function getWinner(routes: string[], url: string): string | undefined {
		const router = new SonicRouter();
		for (const route of routes) {
			const fn = (() => {}) as unknown as Handler;
			(fn as any).routeName = route;
			router.addRoute({
				method: "GET",
				path: route,
				handlers: [fn],
			});
		}
		const matched = router.match("GET", url);
		if (!matched || !matched.handlers) return undefined;
		const handler = Array.isArray(matched.handlers) ? matched.handlers[0] : matched.handlers;
		return handler ? (handler as any).routeName : undefined;
	}

	it("Static vs Param (Param registered first)", () => {
		expect(getWinner(["/users/:id", "/users/profile"], "/users/profile")).toBe(
			"/users/profile",
		);
	});

	it("Static vs Param (Static registered first)", () => {
		expect(getWinner(["/users/profile", "/users/:id"], "/users/profile")).toBe(
			"/users/profile",
		);
	});

	it("Param vs Wildcard", () => {
		expect(getWinner(["/files/*", "/files/:name"], "/files/config.json")).toBe(
			"/files/:name",
		);
	});

	it("Static vs Wildcard", () => {
		expect(getWinner(["/*", "/login"], "/login")).toBe("/login");
	});

	it("Deeper Static Tie-breaker", () => {
		// URL /books/items matches BOTH /:category/items (category=books) and /books/:id (id=items).
		// Segment 1: :category (param) vs books (static). Static wins.
		expect(getWinner(["/:category/items", "/books/:id"], "/books/items")).toBe(
			"/books/:id",
		);
	});

	it("Length Tie-breaker (Wildcards)", () => {
		expect(getWinner(["/api/*", "/api/users/*"], "/api/users/123")).toBe(
			"/api/users/*",
		);
	});

	it("Registration Order (Identical Shape)", () => {
		expect(getWinner(["/post/:id", "/post/:slug"], "/post/hello")).toBe(
			"/post/:id",
		);
	});

	it("Root vs Wildcard", () => {
		expect(getWinner(["/*", "/"], "/")).toBe("/");
	});

	it("Multiple Params vs Static Segment", () => {
		expect(
			getWinner(["/api/:version/:resource", "/api/v1/users"], "/api/v1/users"),
		).toBe("/api/v1/users");
	});
});
