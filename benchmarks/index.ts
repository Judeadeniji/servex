import { bench, group, run } from "mitata";
import { createContext } from "../src/context";
import { background, withCancel, withValue } from "../src/core/signal";
import { createServer } from "../src/index";
import { RouterAdapter, RouterType } from "../src/router/adapter";

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

group("1. ROUTER MATCHING", () => {
	bench("RadixRouter: Static Match", () => {
		radixRouter.match("GET", "/static/path/to/resource");
	});
	bench("TrieRouter: Static Match", () => {
		trieRouter.match("GET", "/static/path/to/resource");
	});
	bench("SonicRouter: Static Match", () => {
		sonicRouter.match("GET", "/static/path/to/resource");
	});

	bench("RadixRouter: Dynamic Match", () => {
		radixRouter.match("GET", "/dynamic/path/12345");
	});
	bench("TrieRouter: Dynamic Match", () => {
		trieRouter.match("GET", "/dynamic/path/12345");
	});
	bench("SonicRouter: Dynamic Match", () => {
		sonicRouter.match("GET", "/dynamic/path/12345");
	});

	bench("RadixRouter: Wildcard Match", () => {
		radixRouter.match("GET", "/wildcard/nested/folder/file.txt");
	});
	bench("SonicRouter: Wildcard Match", () => {
		sonicRouter.match("GET", "/wildcard/nested/folder/file.txt");
	});
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

group("2. MIDDLEWARE CHAINING", () => {
	bench("Server: 3x Global Middlewares", async () => {
		const midReq = new Request("http://localhost/chain");
		await midApp.fetch(midReq);
	});
});

// 3. SERVER LIFECYCLE (E2E)
const basicApp = createServer();
basicApp.get("/hello", (c) => c.json({ hello: "world" }));

group("3. SERVER LIFECYCLE (E2E)", () => {
	bench("Server: End-to-End JSON Fetch", async () => {
		const reqHello = new Request("http://localhost/hello");
		await basicApp.fetch(reqHello);
	});
});

group("SignalCtx", () => {
	bench("SignalCtx: withValue Deep Chain", () => {
		const rootSignal = background();
		let ctx = rootSignal;
		for (let i = 0; i < 5; i++) {
			ctx = withValue(ctx, `key-${i}`, i);
		}
		ctx.value("key-0");
	});

	bench("SignalCtx: withCancel Cascade", () => {
		const rootSignal = background();
		const [ctx, cancel] = withCancel(rootSignal);
		const [ctx2] = withCancel(ctx);
		const [_ctx3] = withCancel(ctx2);
		cancel();
	});
});

// 5. CORE CONTEXT
group("5. CORE CONTEXT", () => {
	const dummyReq = new Request("http://localhost/");
	bench("Context: Instantiation", () => {
		createContext(dummyReq, {}, {});
	});

	const ctxReq = new Request("http://localhost/");
	const ctxInstance = createContext(ctxReq, {}, {});
	bench("Context: Response Creation (JSON)", () => {
		ctxInstance.json({ test: true }, 200, { "X-Test": "yes" });
	});

	bench("Context: set/get State", () => {
		ctxInstance.set("userId", 123);
		ctxInstance.get("userId");
	});
});

// 4. HOOKS
const noHookApp = createServer();
noHookApp.get("/", (c) => c.text("ok"));

const onRequestApp = createServer();
onRequestApp.onRequest((_c) => {});
onRequestApp.get("/", (c) => c.text("ok"));

const onBeforeApp = createServer();
onBeforeApp.onBeforeHandle((_c) => {});
onBeforeApp.get("/", (c) => c.text("ok"));

const onAfterApp = createServer();
onAfterApp.onAfterHandle((_c, _res) => {});
onAfterApp.get("/", (c) => c.text("ok"));

const onResponseApp = createServer();
onResponseApp.onResponse((_c) => {});
onResponseApp.get("/", (c) => c.text("ok"));

const allHooksApp = createServer();
allHooksApp.onRequest((_c) => {});
allHooksApp.onBeforeHandle((_c) => {});
allHooksApp.onAfterHandle((_c, _res) => {});
allHooksApp.onError((_err, _c) => {});
allHooksApp.onResponse((_c) => {});
allHooksApp.get("/", (c) => c.text("ok"));

const thickHooksApp = createServer();
for (let i = 0; i < 3; i++) thickHooksApp.onRequest((_c) => {});
for (let i = 0; i < 3; i++) thickHooksApp.onBeforeHandle((_c) => {});
for (let i = 0; i < 3; i++) thickHooksApp.onAfterHandle((_c, _res) => {});
for (let i = 0; i < 3; i++) thickHooksApp.onResponse((_c) => {});
thickHooksApp.get("/", (c) => c.text("ok"));

const shortCircuitApp = createServer();
shortCircuitApp.onRequest((_c) => new Response("blocked", { status: 403 }));
shortCircuitApp.get("/", (c) => c.text("ok"));

const errorHookApp = createServer();
errorHookApp.onError((_err, c) => c.text("caught", 500));
errorHookApp.get("/", (_c) => {
	throw new Error("boom");
});

const deferApp = createServer();
deferApp.get("/", (c) => {
	c.defer(() => {
		/* background task */
	});
	return c.text("ok");
});

group("4. HOOKS", () => {
	bench("Hooks: Baseline (no hooks)", async () => {
		await noHookApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: onRequest (1x)", async () => {
		await onRequestApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: onBeforeHandle (1x)", async () => {
		await onBeforeApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: onAfterHandle (1x)", async () => {
		await onAfterApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: onResponse (1x)", async () => {
		await onResponseApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: All 5 hooks (1x each)", async () => {
		await allHooksApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: All 4 hooks (3x each)", async () => {
		await thickHooksApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: onRequest short-circuit", async () => {
		await shortCircuitApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: onError (throw + catch)", async () => {
		await errorHookApp.fetch(new Request("http://localhost/"));
	});
	bench("Hooks: Deferred Tasks (1x)", async () => {
		await deferApp.fetch(new Request("http://localhost/"));
	});
});

await run();
