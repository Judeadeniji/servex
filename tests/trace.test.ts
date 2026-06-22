import { describe, expect, it } from "bun:test";
import { createServer } from "../src";

describe("Trace feature", () => {
	it("should trigger trace listeners with correct lifecycle timings and order", async () => {
		const app = createServer();

		const executionOrder: string[] = [];

		app.trace(
			async ({
				onRequest,
				onBeforeHandle,
				onHandle,
				onAfterHandle,
				onResponse,
			}) => {
				onRequest(({ onStop, begin }) => {
					expect(typeof begin).toBe("number");
					executionOrder.push("onRequest-begin");
					onStop(({ begin: stopBegin, end, error }) => {
						expect(stopBegin).toBe(begin);
						expect(end).toBeGreaterThanOrEqual(begin);
						expect(error).toBeNull();
						executionOrder.push("onRequest-end");
					});
				});
				onBeforeHandle(({ onStop }) => {
					executionOrder.push("onBeforeHandle-begin");
					onStop(() => {
						executionOrder.push("onBeforeHandle-end");
					});
				});
				onHandle(({ onStop }) => {
					executionOrder.push("onHandle-begin");
					onStop(() => {
						executionOrder.push("onHandle-end");
					});
				});
				onAfterHandle(({ onStop }) => {
					executionOrder.push("onAfterHandle-begin");
					onStop(() => {
						executionOrder.push("onAfterHandle-end");
					});
				});
				onResponse(({ onStop }) => {
					executionOrder.push("onResponse-begin");
					onStop(() => {
						executionOrder.push("onResponse-end");
					});
				});
			},
		);

		app.get("/", (c) => {
			executionOrder.push("handle");
			return c.text("Traced!");
		});

		const res = await app.request("http://localhost/");
		expect(await res.text()).toBe("Traced!");

		// Wait a brief moment for post-response hooks to finish
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Verify order
		expect(executionOrder).toEqual([
			"onRequest-begin",
			"onRequest-end",
			"onBeforeHandle-begin",
			"onBeforeHandle-end",
			"onHandle-begin",
			"handle",
			"onHandle-end",
			"onAfterHandle-begin",
			"onAfterHandle-end",
			"onResponse-begin",
			"onResponse-end",
		]);
	});

	it("should capture errors in trace onStop and preserve order", async () => {
		const app = createServer();
		const executionOrder: string[] = [];

		app.trace(async ({ onHandle, onError }) => {
			onHandle(({ onStop }) => {
				executionOrder.push("onHandle-begin");
				onStop(({ error }) => {
					expect(error).toBeDefined();
					expect(error?.message).toBe("Simulated Crash");
					executionOrder.push("onHandle-error");
				});
			});
			onError(({ onStop }) => {
				executionOrder.push("onError-begin");
				onStop(() => {
					executionOrder.push("onError-end");
				});
			});
		});

		app.get("/crash", () => {
			throw new Error("Simulated Crash");
		});

		const res = await app.request("http://localhost/crash");
		expect(res.status).toBe(500);

		expect(executionOrder).toEqual([
			"onHandle-begin",
			"onHandle-error",
			"onError-begin",
			"onError-end",
		]);
	});
});
