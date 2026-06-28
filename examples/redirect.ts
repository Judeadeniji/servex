import { createServer } from "../src";

const app = createServer()
	.get("/old", (c) => {
		// Redirect to /new with a 301 Moved Permanently status
		return c.redirect("/new", 301);
	})
	.get("/new", (c) => {
		return c.text("You have been redirected to the new location!");
	});

export default { fetch: app.fetch };
