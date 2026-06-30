import autocannon from "autocannon";
import { createServer } from "../src/index";
import { createRPCFunction } from "../src/rpc/function";
import { rpc as rpcNew } from "../src/rpc/plugin";
import { rpc as rpcOld } from "../src/rpc/plugin-old";

const ROUTE_COUNT = 500;
const TARGET_ROUTE = `route${ROUTE_COUNT - 1}`; // The worst-case route for O(N) lookup

// Generate a large registry to simulate a real-world RPC setup
const registry: Record<string, any> = {};
for (let i = 0; i < ROUTE_COUNT; i++) {
	registry[`route${i}`] = createRPCFunction().handler(() => {
		return { message: `Hello from route ${i}` };
	});
}

const appOld = createServer().use(rpcOld(registry));
const appNew = createServer().use(rpcNew(registry));

const PORT_OLD = 3005;
const PORT_NEW = 3006;

appOld.listen({ port: PORT_OLD });
appNew.listen({ port: PORT_NEW });

async function runBench(name: string, url: string) {
	console.log(`\nStarting benchmark: ${name}`);
	console.log(`URL: ${url}`);
	
	return new Promise((resolve, reject) => {
		const instance = autocannon(
			{
				url,
				method: "POST",
				connections: 200,
				duration: 20, // 5 seconds is enough to see the difference
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({}),
			},
			(err, result) => {
				if (err) return reject(err);
				
				console.log(`\nResults for ${name}:`);
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
		await runBench("Old RPC (Wildcard O(N) Lookup)", `http://localhost:${PORT_OLD}/rpc/${TARGET_ROUTE}`);
		await runBench("New RPC (Radix Router Lookup)", `http://localhost:${PORT_NEW}/rpc/${TARGET_ROUTE}`);
	} catch (e) {
		console.error("Benchmark failed", e);
	} finally {
		process.exit(0);
	}
}

main();
