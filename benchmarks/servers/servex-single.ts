import { createServer } from "../../src/index";
import { RouterType } from "../../src/router/adapter";

const app = createServer({ router: RouterType.SONIC });
app.get("/", () => new Response("ok"));
Bun.serve({ port: 3000, fetch: app.fetch });
console.log("[servex] listening on :3000");
