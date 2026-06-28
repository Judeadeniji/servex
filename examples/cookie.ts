import { createServer } from "../src";

const app = createServer()
	.get("/", (c) => {
		c.setCookie("name", "ServeX", { httpOnly: true });
		return c.text("Cookie has been set!");
	});

export default { fetch: app.fetch };
