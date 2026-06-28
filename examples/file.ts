import { createServer } from "../src";
import { serveStatic } from "../src/middlewares/serve-static";

const app = createServer()
	// Serve all files from the "examples" directory statically
	.use(serveStatic({ root: "./examples" }))
	.get("/", (c) => c.text("Try accessing /file.ts to see this source code!"));

export default { fetch: app.fetch };
