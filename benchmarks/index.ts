import { createServer } from "../src/index";
import { RouterAdapter, RouterType } from "../src/router/adapter";
import { Context } from "../src/context";
import { background, withValue, withCancel } from "../src/core/signal";

const ITERATIONS = 100_000;

async function benchmark(name: string, fn: () => void | Promise<void>, iterations = ITERATIONS) {
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
  console.log(`| ${name.padEnd(35)} | ${opsPerSec.padStart(12)} ops/sec | ${timeMs.toFixed(2).padStart(8)}ms |`);
}

async function runBenchmarks() {
  console.log("=========================================================================");
  console.log("| Benchmark                           | Performance      | Total Time |");
  console.log("|-------------------------------------|------------------|------------|");

  // 1. ROUTER MATCHING
  const radixRouter = new RouterAdapter({ type: RouterType.RADIX });
  const trieRouter = new RouterAdapter({ type: RouterType.TRIE });
  
  radixRouter.addRoute({ method: "GET", path: "/static/path/to/resource", data: [] });
  radixRouter.addRoute({ method: "GET", path: "/dynamic/path/:id", data: [] });
  radixRouter.addRoute({ method: "GET", path: "/wildcard/*path", data: [] });

  trieRouter.addRoute({ method: "GET", path: "/static/path/to/resource", data: [] });
  trieRouter.addRoute({ method: "GET", path: "/dynamic/path/:id", data: [] });
  trieRouter.addRoute({ method: "GET", path: "/wildcard/*path", data: [] });

  await benchmark("RadixRouter: Static Match", () => {
    radixRouter.match("GET", "/static/path/to/resource");
  });
  await benchmark("TrieRouter: Static Match", () => {
    trieRouter.match("GET", "/static/path/to/resource");
  });
  await benchmark("RadixRouter: Dynamic Match", () => {
    radixRouter.match("GET", "/dynamic/path/12345");
  });
  await benchmark("TrieRouter: Dynamic Match", () => {
    trieRouter.match("GET", "/dynamic/path/12345");
  });
  await benchmark("RadixRouter: Wildcard Match", () => {
    radixRouter.match("GET", "/wildcard/nested/folder/file.txt");
  });

  // 2. MIDDLEWARE CHAINING
  const midApp = createServer();
  midApp.use("*", async (c, next) => { await next(); });
  midApp.use("*", async (c, next) => { await next(); });
  midApp.use("*", async (c, next) => { await next(); });
  midApp.get("/chain", (c) => c.text("ok"));
  
  await benchmark("Server: 3x Global Middlewares", async () => {
    const midReq = new Request("http://localhost/chain");
    await midApp.fetch(midReq);
  }, 10_000);

  // 3. SERVER LIFECYCLE (E2E)
  const basicApp = createServer();
  basicApp.get("/hello", (c) => c.json({ hello: "world" }));
  
  await benchmark("Server: End-to-End JSON Fetch", async () => {
    const reqHello = new Request("http://localhost/hello");
    await basicApp.fetch(reqHello);
  }, 10_000);

  await benchmark("SignalCtx: withValue Deep Chain", () => {
    const rootSignal = background();
    let ctx = rootSignal;
    for(let i=0; i<5; i++) {
      ctx = withValue(ctx, `key-${i}`, i);
    }
    ctx.value("key-0");
  });

  await benchmark("SignalCtx: withCancel Cascade", () => {
    const rootSignal = background();
    const [ctx, cancel] = withCancel(rootSignal);
    const [ctx2] = withCancel(ctx);
    const [ctx3] = withCancel(ctx2);
    cancel();
  });

  // 5. CORE CONTEXT
  await benchmark("Context: Instantiation", () => {
    const dummyReq = new Request("http://localhost/");
    new Context(dummyReq, {}, { params: {} });
  }, 10_000);

  const ctxReq = new Request("http://localhost/");
  const ctxInstance = new Context(ctxReq, {}, { params: {} });
  await benchmark("Context: Response Creation (JSON)", () => {
    ctxInstance.json({ test: true }, 200, { "X-Test": "yes" });
  }, 10_000);

  console.log("=========================================================================");
}

runBenchmarks().catch(console.error);
