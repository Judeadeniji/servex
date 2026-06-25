import { createServer, showRoutes } from "../../src/index";
import { RouterType } from "../../src/router/adapter";

const app = createServer({
	router: RouterType.SONIC,
	nativeStaticResponse: true,
}).get("/", "ok");

// @ts-ignore: Excessively deep recursion
showRoutes(app);
Bun.serve({ port: 3000, fetch: app.fetch, static: app.static });
console.log("[servex] listening on :3000");
