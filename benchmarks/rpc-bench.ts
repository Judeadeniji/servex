import autocannon from "autocannon";
import { createServer } from "../src/index";
import { createRPCFunction } from "../src/rpc/function";
import { rpc } from "../src/rpc/plugin";

const ROUTE_COUNT = 500;
const TARGET_ROUTE = `route${ROUTE_COUNT - 1}`; 

// Generate a large registry for RPC
const registry: Record<string, any> = {};
for (let i = 0; i < ROUTE_COUNT; i++) {
	registry[`route${i}`] = createRPCFunction().handler(() => {
		return { message: `Hello from route ${i}` };
	});
}

const appRPC = createServer().use(rpc(registry));

// Generate the exact same routes using native ServeX Router
const appNative = createServer();
for (let i = 0; i < ROUTE_COUNT; i++) {
	appNative.post(`/route${i}`, async (ctx) => {
		try {
			// Manually read JSON to simulate what the RPC wrapper does
			await ctx.req.json();
		} catch {
			return ctx.json({ ok: false, error: "VALIDATION_ERROR" }, 400);
		}
		return ctx.json({ ok: true, data: { message: `Hello from route ${i}` } });
	});
}

const PORT_RPC = 3005;
const PORT_NATIVE = 3006;

appRPC.listen({ port: PORT_RPC });
appNative.listen({ port: PORT_NATIVE });

async function runBench(name: string, url: string) {
	console.log(`\nStarting benchmark: ${name}`);
	console.log(`URL: ${url}`);
	
	return new Promise((resolve, reject) => {
		const instance = autocannon(
			{
				url,
				method: "POST",
				connections: 200,
				duration: 10,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({}),
			},
			(err, result) => {
				if (err) return reject(err);
				
				console.log(`\nResults for ${name}:`);
				console.log(`- 2xx Responses: ${result["2xx"]}`);
				console.log(`- Non-2xx Responses: ${result.non2xx}`);
				console.log(`- Requests/sec: ${result.requests.average}`);
				console.log(`- Latency (p99): ${result.latency.p99} ms`);
				console.log(`- Latency (p99.9): ${result.latency.p99_9} ms`); // Required by Rule 03
				console.log(`- Throughput: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
				resolve(result);
			}
		);

		autocannon.track(instance, { renderProgressBar: true });
	});
}

async function main() {
	// Let the JIT warm up
	await new Promise(r => setTimeout(r, 1000));
	
	try {
		await runBench("ServeX Native Router (JSON Parsing)", `http://localhost:${PORT_NATIVE}/${TARGET_ROUTE}`);
		await runBench("ServeX RPC Plugin", `http://localhost:${PORT_RPC}/${TARGET_ROUTE}`);
	} catch (e) {
		console.error("Benchmark failed", e);
	} finally {
		process.exit(0);
	}
}

main();
