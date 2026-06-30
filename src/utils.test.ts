import { describe, expect, it } from "bun:test";
import { SUPPORTED_METHODS, isHTMLBundle, waitUntil } from "./utils";

describe("Utils", () => {
	describe("waitUntil", () => {
		it("should resolve when the promise resolves", async () => {
			let resolved = false;
			const p = new Promise((resolve) => {
				setTimeout(() => {
					resolved = true;
					resolve(true);
				}, 10);
			});

			await waitUntil(p);
			expect(resolved).toBe(true);
		});

		it("should handle non-promise values", async () => {
			await waitUntil("hello" as any);
			expect(true).toBe(true); // just checking it doesn't throw
		});
	});

	describe("SUPPORTED_METHODS", () => {
		it("should contain standard HTTP methods", () => {
			expect(SUPPORTED_METHODS).toEqual([
				"get",
				"post",
				"put",
				"delete",
				"patch",
				"options",
				"head",
			]);
		});
	});

	describe("isHTMLBundle", () => {
		it("should return true if object toString is [object HTMLBundle]", () => {
			const obj = {
				toString: () => "[object HTMLBundle]",
			};
			expect(isHTMLBundle(obj)).toBe(true);
		});

		it("should return true if constructor name is HTMLBundle", () => {
			class HTMLBundle {}
			const obj = new HTMLBundle();
			expect(isHTMLBundle(obj)).toBe(true);
		});

		it("should return false for null or undefined", () => {
			expect(isHTMLBundle(null)).toBe(false);
			expect(isHTMLBundle(undefined)).toBe(false);
		});

		it("should return false for regular objects", () => {
			expect(isHTMLBundle({})).toBe(false);
			expect(isHTMLBundle([])).toBe(false);
			expect(isHTMLBundle("test")).toBe(false);
		});
	});
});
