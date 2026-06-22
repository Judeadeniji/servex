import { compileHandlerChain } from "../../src/compiler/index";
import { Context } from "../../src/context";

// A mock handler that simulates real work (allocating objects)
const handler = (c: any, next: any) => {
	// Allocate some memory to generate garbage
	const obj = { data: new Array(100).fill(Math.random()) };
	c.set("obj", obj);
	if (next) return next();
	return new Response("OK");
};

const terminalHandler = (c: any) => {
	const obj = { data: new Array(100).fill(Math.random()) };
	c.set("obj", obj);
	return new Response("OK");
};

function runNative(handlers: any[], iterations: number, ctx: any) {
	let i = 0;
	const next = () => {
		i++;
		if (i >= handlers.length) return undefined;
		return handlers[i](ctx, next);
	};
	for (let j = 0; j < iterations; j++) {
		i = 0;
		handlers[0](ctx, next);
	}
}

async function measure(name: string, fn: () => void | Promise<void>) {
	Bun.gc(true); // Force GC before test
	const startMemory = process.memoryUsage().heapUsed;
	
	const start = performance.now();
	
	// Start event loop lag tracker to proxy GC pauses
	let maxLag = 0;
	let lastCheck = performance.now();
	const interval = setInterval(() => {
		const now = performance.now();
		const lag = now - lastCheck - 1; // 1ms interval
		if (lag > maxLag) maxLag = lag;
		lastCheck = now;
	}, 1);

	await fn();

	clearInterval(interval);
	const endMemory = process.memoryUsage().heapUsed;
	const duration = performance.now() - start;
	
	console.log(`| ${name.padEnd(30)} | ${(duration).toFixed(2)}ms | ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB | ${maxLag.toFixed(2)}ms max lag |`);
}

async function run() {
	console.log("=======================================================================");
	console.log("| Benchmark                      | Time       | Heap Diff  | Max Pause |");
	console.log("|--------------------------------|------------|------------|-----------|");

	const ctx = new Context(new Request("http://localhost/"), {}, { params: {} });
	const ITERATIONS = 2_000_000;

	// Short Chain (3)
	const shortHandlers = [handler, handler, terminalHandler];
	const compiledShort = compileHandlerChain(shortHandlers);
	
	await measure("Native Short Chain", () => runNative(shortHandlers, ITERATIONS, ctx));
	await measure("Compiled Short Chain", async () => {
		for (let i = 0; i < ITERATIONS; i++) {
			await compiledShort(ctx);
		}
	});

	// Long Chain (9)
	const longHandlers = [handler, handler, handler, handler, handler, handler, handler, handler, terminalHandler];
	const compiledLong = compileHandlerChain(longHandlers);

	await measure("Native Long Chain", () => runNative(longHandlers, ITERATIONS, ctx));
	await measure("Compiled Long Chain", async () => {
		for (let i = 0; i < ITERATIONS; i++) {
			await compiledLong(ctx);
		}
	});
	console.log("=======================================================================");
}

run();
