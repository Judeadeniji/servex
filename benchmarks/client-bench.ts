import { bench, group, run } from "mitata";
import { createServer } from "../src/index";
import { createClient } from "../src/client/index";

// Setup server
const app = createServer().get("/api/test", (c) => c.json({ ok: true }));

type AppType = typeof app;

// Setup custom client bypassing network
// @ts-ignore: Excessively deep recursion
const client = createClient<AppType>("http://localhost", { fetch: app.fetch });

// Warmup
for (let i = 0; i < 5000; i++) {
	await client.api.test.get();
	await app.fetch(new Request("http://localhost/api/test"));
}

group("RPC Client Proxy Overhead", () => {
	bench("Direct app.fetch", async () => {
		await app.fetch(new Request("http://localhost/api/test"));
	});

	bench("Client client.api.test.get()", async () => {
		await client.api.test.get();
	});

	// To measure exactly the proxy chaining and url building overhead
	bench("Client Proxy Path Building (1 segment)", async () => {
		// Just trigger proxy resolution without fetch execution
		// The proxy delays execution until the method (e.g. get) is called.
		client.api;
	});

	bench("Client Proxy Path Building (2 segments)", async () => {
		client.api.test;
	});
});

await run();
