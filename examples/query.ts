import { createServer } from "../src";

const app = createServer()
	.get("/search", (c) => {
		// Single query parameter (e.g. ?q=bun)
		const query = c.query("q") || "nothing";
		
		// Multiple values for the same parameter (e.g. ?tag=a&tag=b)
		const tags = c.queries("tag") || [];
		
		return c.json({
			searchFor: query,
			filters: tags
		});
	});

export default { fetch: app.fetch };
