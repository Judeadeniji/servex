import { createServer } from "../src";

const t1 = performance.now();
const app = createServer()
	.get("/", (c) => c.text("Hi from ServeX!"));

console.log(`Startup time: ${performance.now() - t1}ms`);
export default { fetch: app.fetch };
