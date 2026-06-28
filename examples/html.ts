import { createServer } from "../src";

const app = createServer()
	.get("/", (c) => {
		// c.html automatically sets the Content-Type to text/html
		return c.html(`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<title>ServeX HTML</title>
				<style>
					body { font-family: sans-serif; padding: 2rem; }
					h1 { color: #3b82f6; }
				</style>
			</head>
			<body>
				<h1>Hello from ServeX HTML 👋</h1>
				<p>This response was sent using <code>c.html()</code>.</p>
			</body>
			</html>
		`);
	});

export default { fetch: app.fetch };
