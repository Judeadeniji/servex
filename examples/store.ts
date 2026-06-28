import { createServer } from "../src";

// Type the environment to strongly type variables in context
type AppEnv = {
	Variables: {
		requestId: string;
		startTime: number;
	};
};

const app = createServer<AppEnv>()
	// Middleware to inject data into the store (context variables)
	.use((c, next) => {
		c.set("requestId", crypto.randomUUID());
		c.set("startTime", Date.now());
		return next();
	})
	.get("/", (c) => {
		const reqId = c.get("requestId");
		const elapsed = Date.now() - c.get("startTime");
		return c.json({
			message: "Store example",
			requestId: reqId,
			processingTimeMs: elapsed
		});
	});

export default { fetch: app.fetch };
