import { Context } from "../src/context";
import { background, withCancel, withValue } from "../src/core/signal";
import { createServer } from "../src/index";
import { RouterAdapter, RouterType } from "../src/router/adapter";

const ITERATIONS = 100_000;

async function benchmark(
	name: string,
	fn: () => void | Promise<void>,
	iterations = ITERATIONS,
) {
	// Warmup
	for (let i = 0; i < 1_000; i++) {
		await fn();
	}

	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		await fn();
	}
	const end = performance.now();

	const timeMs = end - start;
	const opsPerSec = (iterations / (timeMs / 1000)).toFixed(0);
	console.log(
		`| ${name.padEnd(35)} | ${opsPerSec.padStart(12)} ops/sec | ${timeMs.toFixed(2).padStart(8)}ms |`,
	);
}

async function runBenchmarks() {
	console.log(
		"=========================================================================",
	);
	console.log(
		"| Benchmark                           | Performance      | Total Time |",
	);
	console.log(
		"|-------------------------------------|------------------|------------|",
	);

	// 1. ROUTER MATCHING
	const radixRouter = new RouterAdapter({ type: RouterType.RADIX });
	const trieRouter = new RouterAdapter({ type: RouterType.TRIE });
	const sonicRouter = new RouterAdapter({ type: RouterType.SONIC });

	radixRouter.addRoute({
		method: "GET",
		path: "/static/path/to/resource",
		data: [],
	});
	radixRouter.addRoute({ method: "GET", path: "/dynamic/path/:id", data: [] });
	radixRouter.addRoute({ method: "GET", path: "/wildcard/*path", data: [] });

	trieRouter.addRoute({
		method: "GET",
		path: "/static/path/to/resource",
		data: [],
	});
	trieRouter.addRoute({ method: "GET", path: "/dynamic/path/:id", data: [] });
	trieRouter.addRoute({ method: "GET", path: "/wildcard/*path", data: [] });

	sonicRouter.addRoute({
		method: "GET",
		path: "/static/path/to/resource",
		data: [],
	});
	sonicRouter.addRoute({ method: "GET", path: "/dynamic/path/:id", data: [] });
	sonicRouter.addRoute({ method: "GET", path: "/wildcard/*path", data: [] });

	await benchmark("RadixRouter: Static Match", () => {
		radixRouter.match("GET", "/static/path/to/resource");
	});
	await benchmark("TrieRouter: Static Match", () => {
		trieRouter.match("GET", "/static/path/to/resource");
	});
	await benchmark("SonicRouter: Static Match", () => {
		sonicRouter.match("GET", "/static/path/to/resource");
	});
	await benchmark("RadixRouter: Dynamic Match", () => {
		radixRouter.match("GET", "/dynamic/path/12345");
	});
	await benchmark("TrieRouter: Dynamic Match", () => {
		trieRouter.match("GET", "/dynamic/path/12345");
	});
	await benchmark("SonicRouter: Dynamic Match", () => {
		sonicRouter.match("GET", "/dynamic/path/12345");
	});
	await benchmark("RadixRouter: Wildcard Match", () => {
		radixRouter.match("GET", "/wildcard/nested/folder/file.txt");
	});
	await benchmark("SonicRouter: Wildcard Match", () => {
		sonicRouter.match("GET", "/wildcard/nested/folder/file.txt");
	});

	// 2. MIDDLEWARE CHAINING
	const midApp = createServer();
	midApp.use("*", async (_c, next) => {
		await next();
	});
	midApp.use("*", async (_c, next) => {
		await next();
	});
	midApp.use("*", async (_c, next) => {
		await next();
	});
	midApp.get("/chain", (c) => c.text("ok"));

	await benchmark(
		"Server: 3x Global Middlewares",
		async () => {
			const midReq = new Request("http://localhost/chain");
			await midApp.fetch(midReq);
		},
		10_000,
	);

	// 3. SERVER LIFECYCLE (E2E)
	const basicApp = createServer();
	basicApp.get("/hello", (c) => c.json({ hello: "world" }));

	await benchmark(
		"Server: End-to-End JSON Fetch",
		async () => {
			const reqHello = new Request("http://localhost/hello");
			await basicApp.fetch(reqHello);
		},
		10_000,
	);

	await benchmark("SignalCtx: withValue Deep Chain", () => {
		const rootSignal = background();
		let ctx = rootSignal;
		for (let i = 0; i < 5; i++) {
			ctx = withValue(ctx, `key-${i}`, i);
		}
		ctx.value("key-0");
	});

	await benchmark("SignalCtx: withCancel Cascade", () => {
		const rootSignal = background();
		const [ctx, cancel] = withCancel(rootSignal);
		const [ctx2] = withCancel(ctx);
		const [_ctx3] = withCancel(ctx2);
		cancel();
	});

	// 5. CORE CONTEXT
	await benchmark(
		"Context: Instantiation",
		() => {
			const dummyReq = new Request("http://localhost/");
			new Context(dummyReq, {}, { params: {} });
		},
		10_000,
	);

	const ctxReq = new Request("http://localhost/");
	const ctxInstance = new Context(ctxReq, {}, { params: {} });
	await benchmark(
		"Context: Response Creation (JSON)",
		() => {
			ctxInstance.json({ test: true }, 200, { "X-Test": "yes" });
		},
		10_000,
	);

	await benchmark(
		"Context: set/get State",
		() => {
			ctxInstance.set("userId", 123);
			ctxInstance.get("userId");
		},
		10_000,
	);

	// 4. HOOKS
	// Baseline: no hooks
	const noHookApp = createServer();
	noHookApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: Baseline (no hooks)",
		async () => {
			await noHookApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// onRequest only
	const onRequestApp = createServer();
	onRequestApp.onRequest((_c) => {});
	onRequestApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: onRequest (1x)",
		async () => {
			await onRequestApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// onBeforeHandle only
	const onBeforeApp = createServer();
	onBeforeApp.onBeforeHandle((_c) => {});
	onBeforeApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: onBeforeHandle (1x)",
		async () => {
			await onBeforeApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// onAfterHandle only
	const onAfterApp = createServer();
	onAfterApp.onAfterHandle((_c, _res) => {});
	onAfterApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: onAfterHandle (1x)",
		async () => {
			await onAfterApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// onResponse only
	const onResponseApp = createServer();
	onResponseApp.onResponse((_c) => {});
	onResponseApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: onResponse (1x)",
		async () => {
			await onResponseApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// All hooks stacked (1 handler each)
	const allHooksApp = createServer();
	allHooksApp.onRequest((_c) => {});
	allHooksApp.onBeforeHandle((_c) => {});
	allHooksApp.onAfterHandle((_c, _res) => {});
	allHooksApp.onError((_err, _c) => {});
	allHooksApp.onResponse((_c) => {});
	allHooksApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: All 5 hooks (1x each)",
		async () => {
			await allHooksApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// 3x each hook stacked
	const thickHooksApp = createServer();
	for (let i = 0; i < 3; i++) thickHooksApp.onRequest((_c) => {});
	for (let i = 0; i < 3; i++) thickHooksApp.onBeforeHandle((_c) => {});
	for (let i = 0; i < 3; i++) thickHooksApp.onAfterHandle((_c, _res) => {});
	for (let i = 0; i < 3; i++) thickHooksApp.onResponse((_c) => {});
	thickHooksApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: All 4 hooks (3x each)",
		async () => {
			await thickHooksApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// onRequest short-circuit (returns early before handler)
	const shortCircuitApp = createServer();
	shortCircuitApp.onRequest((_c) => new Response("blocked", { status: 403 }));
	shortCircuitApp.get("/", (c) => c.text("ok"));
	await benchmark(
		"Hooks: onRequest short-circuit",
		async () => {
			await shortCircuitApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// onError hook hit (handler throws)
	const errorHookApp = createServer();
	errorHookApp.onError((_err, c) => c.text("caught", 500));
	errorHookApp.get("/", (_c) => {
		throw new Error("boom");
	});
	await benchmark(
		"Hooks: onError (throw + catch)",
		async () => {
			await errorHookApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	// deferred tasks
	const deferApp = createServer();
	deferApp.get("/", (c) => {
		c.defer(() => {
			/* background task */
		});
		return c.text("ok");
	});
	await benchmark(
		"Hooks: Deferred Tasks (1x)",
		async () => {
			await deferApp.fetch(new Request("http://localhost/"));
		},
		10_000,
	);

	console.log(
		"=========================================================================",
	);
}

runBenchmarks().catch(console.error);
