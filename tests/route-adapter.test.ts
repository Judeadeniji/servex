import { describe, expect, it } from "bun:test";
import { RouterAdapter, RouterType } from "../src/router/adapter";
import type { Route } from "../src/router/base";

describe("RouterAdapter", () => {
	const routes: Route[] = [
		{
			method: "GET",
			path: "/heroes/:heroName",
			data: {
				/* ... */
			},
		},
		{
			method: "POST",
			path: "/heroes",
			data: {
				/* ... */
			},
		},
		{
			method: "GET",
			path: "/search",
			data: {
				/* ... */
			},
		},
		{
			method: "GET",
			path: "/assets/*filepath",
			data: {
				/* ... */
			},
		},
	];

	it("should initialize with Trie router and match routes correctly", () => {
		const router = new RouterAdapter({
			type: RouterType.TRIE,
			routes,
		});

		const matched = router.match("GET", "/heroes/spiderman");
		expect(matched).not.toBeNull();
		expect(matched?.matched).toBe(true);
		expect(matched?.params.heroName).toBe("spiderman");
	});

	it("should initialize with Sonic router and match routes correctly", () => {
		const adapter = new RouterAdapter({ type: RouterType.SONIC });
		adapter.addRoute({ method: "GET", path: "/test", data: "testData" });

		const match = adapter.match("GET", "/test");
		expect(match).not.toBeNull();
		expect(match?.data).toBe("testData");
	});

	it("should switch to Radix router and retain routes", () => {
		const router = new RouterAdapter({
			type: RouterType.TRIE,
			routes,
		});

		router.switchRouter(RouterType.RADIX);

		const matched = router.match("GET", "/assets/images/logo.png");

		expect(matched).not.toBeNull();
		expect(matched?.matched).toBe(true);
		expect(matched?.params.filepath).toBe("images/logo.png");
	});

	it("should return null for unmatched routes", () => {
		const router = new RouterAdapter({
			type: RouterType.RADIX,
			routes,
		});

		const matched = router.match("DELETE", "/heroes/spiderman");
		expect(matched).toBeNull();
	});
});
