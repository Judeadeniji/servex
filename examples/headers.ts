import { createServer } from "../src";

const app = createServer()
	.get("/", (c) => {
		// Set a custom response header
		c.setHeaders({ "X-Powered-By": "ServeX", "X-Custom": "Value" });
		
		// Read a request header
		const userAgent = c.req.headers.get("user-agent") || "Unknown";
		
		return c.text(`Hello! Your user agent is: ${userAgent}`);
	});

export default { fetch: app.fetch };
