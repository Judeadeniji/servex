import { bench, group, run } from "mitata";
import { createServer } from "../src/index";
import { rpc, createRPCFunction, createRPCClient } from "../src/rpc/index";

// Setup server
const app = createServer();
const rpcPlugin = rpc({
	test: createRPCFunction().handler(() => {
		return { ok: true };
	}),
});
app.use("/rpc", rpcPlugin);

const client = createRPCClient<typeof rpcPlugin>({
	baseURL: "http://localhost",
	fetch: async (url, init) => app.fetch(new Request(url, init as RequestInit)),
});

// Setup standard router
const standardApp = createServer().post("/rpc/test", (c) =>
	c.json({ ok: true }),
);

// Warmup
for (let i = 0; i < 5000; i++) {
	await client.test({});
	await standardApp.fetch(
		new Request("http://localhost/rpc/test", {
			method: "POST",
			body: JSON.stringify({}),
			headers: { "content-type": "application/json" },
		}),
	);
}

group("RPC Plugin Overhead", () => {
	bench("Standard app.fetch (REST)", async () => {
		await standardApp.fetch(
			new Request("http://localhost/rpc/test", {
				method: "POST",
				body: JSON.stringify({}),
				headers: { "content-type": "application/json" },
			}),
		);
	});

	bench("RPC client.test()", async () => {
		await client.test({});
	});
});

await run();
