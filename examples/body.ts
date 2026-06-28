import { createServer } from "../src";

const app = createServer()
	.post("/mirror", async (c) => {
		const body = await c.req.json();
		return c.json(body);
	});

export default { fetch: app.fetch };
