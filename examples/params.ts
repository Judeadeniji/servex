import { createServer } from "../src";

const app = createServer()
	.get("/", (c) => c.text("ServeX Params Example"))
	// Retrieve params
	.get("/id/:id", (c) => c.text(c.params("id")));

export default { fetch: app.fetch };
