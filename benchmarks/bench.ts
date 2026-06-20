import { compileHandlerChain } from "../src/compiler/index";
import { RouterType } from "../src/router/adapter";
import { executeHandlers } from "../src/core/response";
import { Context } from "../src/context";
import type { Handler } from "../src/types";
import { createServer } from "../src/index";

const ITERATIONS = 1_000_000;

// Helper to generate N handlers
function generateChain(length: number): Handler<any>[] {
  const chain: Handler<any>[] = [];
  for (let i = 0; i < length - 1; i++) {
    chain.push(async (ctx: any, next: any) => {
      ctx.executionCtx = (ctx.executionCtx || 0) + 1;
      await next();
    });
  }
  chain.push((ctx: any) => new Response("OK"));
  return chain;
}

const mockRequest = new Request("http://localhost/");
const createMockContext = () => ({
  req: mockRequest,
  header: new Headers(),
  executionCtx: null,
  deferred: []
} as unknown as Context);

async function testBootTime() {
  console.log("=== JIT Boot Time Cost ===");
  const handlers = generateChain(5);
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    compileHandlerChain(handlers);
  }
  const end = performance.now();
  console.log(`Compiling 1000 routes (len 5) took: ${(end - start).toFixed(2)}ms (${((end-start)/1000).toFixed(3)}ms per route)\n`);
}

async function testE2E() {
  console.log("=== End-to-End Realism Test (3 handlers) ===");
  
  // Set up Non-JIT App (by manually filling compiledCache with executeHandlers wrapper)
  const appNonJit = createServer({ router: RouterType.SONIC });
  const middlewares = [
    async (ctx: any, next: any) => { ctx.executionCtx = 1; await next(); },
    async (ctx: any, next: any) => { ctx.executionCtx = 2; await next(); },
    (ctx: any) => new Response("Hello")
  ];
  appNonJit.get("/api/test", middlewares[2]);
  (appNonJit as any).middlewares.push(middlewares[0], middlewares[1]);
  
  // Force Non-JIT behavior by pre-filling the executor cache
  // But wait, router.match returns a route with a store.executor property too!
  // It's easier to just warm it up to let it populate the route, then overwrite it.
  for (let i = 0; i < 50; i++) await appNonJit.fetch(new Request("http://localhost/api/test"));
  
  // Now overwrite the cached executor with the non-JIT loop
  appNonJit.compiledCache.set("GET/api/test", (ctx: any) => executeHandlers(ctx, middlewares));
  const r = appNonJit['routerAdapter'].match("GET", "/api/test");
  if (r && r.store) r.store.executor = (ctx: any) => executeHandlers(ctx, middlewares);

  // Set up JIT App
  const appJit = createServer({ router: RouterType.SONIC });
  appJit.get("/api/test", middlewares[2]);
  (appJit as any).middlewares.push(middlewares[0], middlewares[1]);
  // Warmup JIT
  for (let i = 0; i < 5000; i++) await appJit.fetch(new Request("http://localhost/api/test"));

  // Full Warmup for Non-JIT now that it's patched
  for (let i = 0; i < 5000; i++) await appNonJit.fetch(new Request("http://localhost/api/test"));

  // Run Non-JIT E2E
  const startNonJit = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await appNonJit.fetch(new Request("http://localhost/api/test"));
  }
  const timeNonJit = performance.now() - startNonJit;

  // Run JIT E2E
  const startJit = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await appJit.fetch(new Request("http://localhost/api/test"));
  }
  const timeJit = performance.now() - startJit;

  console.log(`E2E Non-JIT: ${timeNonJit.toFixed(2)}ms`);
  console.log(`E2E JIT:     ${timeJit.toFixed(2)}ms`);
  console.log(`E2E Speedup: ${(timeNonJit / timeJit).toFixed(2)}x\n`);
}

async function runAll() {
  await testBootTime();
  await testE2E();
}

runAll().catch(console.error);
