import { describe, expect, it } from "bun:test";
import { type Context, createServer } from "../src/index";

describe("Context Lifetime", () => {
	it("should allow context to be used asynchronously after response is sent", async () => {
		const app = createServer();
		let capturedContext: Context | null = null;

		app.get("/", (c) => {
			capturedContext = c;
			return c.text("Hello");
		});

		const req = new Request("http://localhost/");
		const res = await app.request(req);
		expect(res.status).toBe(200);

		// The request is fully completed, executePostProcess has marked it finished.
		expect(capturedContext).not.toBeNull();
		expect(capturedContext!.req.method).toBe("GET");
		
		const originalWarn = console.warn;
		let warningCalled = false;
		console.warn = (msg) => {
			if (msg.includes("after the response was already sent")) {
				warningCalled = true;
			}
		};

		// Modifying the context after response should warn
		capturedContext!.setHeaders({ "X-Late": "true" });
		capturedContext!.json({ hello: "world" });
		
		console.warn = originalWarn;
		expect(warningCalled).toBe(true);
	});
});
