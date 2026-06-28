import { describe, expect, it, mock } from "bun:test";
import { createServer } from "../app";
import { BunAdapter } from "./bun";
import { WebStandardAdapter } from "./web-standard";
import { CloudflareAdapter } from "./cloudflare-worker";

describe("Adapters", () => {
	describe("BunAdapter", () => {
		it("should have correct name", () => {
			expect(BunAdapter.name).toBe("bun");
		});

		it("should implement staticFile", () => {
			expect(BunAdapter.staticFile).toBeDefined();
		});
	});

	describe("WebStandardAdapter", () => {
		it("should have correct name", () => {
			expect(WebStandardAdapter.name).toBe("web-standard");
		});

		it("should throw on listen", () => {
			const app = createServer({ adapter: WebStandardAdapter });
			expect(() => app.listen(3000)).toThrow(
				"WebStandard does not support listen, you might want to export the app instance or use its fetch handler instead",
			);
		});

		it("should not have staticFile implemented", () => {
			expect(WebStandardAdapter.staticFile).toBeUndefined();
		});
	});

	describe("CloudflareAdapter", () => {
		it("should have correct name", () => {
			expect(CloudflareAdapter.name).toBe("cloudflare-worker");
		});

		it("should warn on listen and return dummy server", () => {
			const originalWarn = console.warn;
			let warnCalled = false;
			console.warn = () => {
				warnCalled = true;
			};

			const app = createServer({ adapter: CloudflareAdapter });
			const server = app.listen(3000);

			expect(warnCalled).toBe(true);
			expect(server.port).toBe(0);
			expect(server.hostname).toBe("localhost");
			expect(typeof server.stop).toBe("function");

			console.warn = originalWarn; // restore
		});

		it("should not have staticFile implemented", () => {
			expect(CloudflareAdapter.staticFile).toBeUndefined();
		});
	});
});
