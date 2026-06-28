import { createServer } from "../src";

const app = createServer()
	.onRequest((c) => {
		console.log(`[Request started] ${c.req.method} ${c.req.url}`);
	})
	.onBeforeHandle((c) => {
		console.log(`[Before handle] Preparing to route...`);
	})
	.onAfterHandle((c, res) => {
		console.log(`[After handle] Response status will be ${res.status}`);
		return res;
	})
	.get("/", (c) => c.text("Hooks demo"));

export default { fetch: app.fetch };
