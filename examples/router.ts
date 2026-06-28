import { createServer } from "../src";

const app = createServer()
	.get("/a", (c) => c.text("A"))
	.route("/prefixed", (r) => {
		r.get("/2", (c) => c.text("2"))
		 .get("/ok", (c) => c.text("1"));
	});

export default { fetch: app.fetch };
