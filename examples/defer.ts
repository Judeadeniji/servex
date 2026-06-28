import { createServer } from "../src";

const app = createServer()
	.get("/", (c) => {
		// The deferred task runs after the response is sent to the client.
		// Great for analytics, logging, or slow background processing.
		c.defer(async () => {
			await Bun.sleep(100);
			console.log("Deferred background task finished!");
		});
		
		return c.text("Response sent immediately! Check server logs for deferred task.");
	});

export default { fetch: app.fetch };
