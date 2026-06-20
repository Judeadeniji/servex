import { compileHandlerChain } from "./src/compiler/index";
import { executeHandlers } from "./src/core/response";
import { Context } from "./src/context";
import { Handler } from "./src/types";

const iterations = 1_000_000;

// Create a realistic chain of handlers (middlewares + route)
const handlers: Handler<any>[] = [
  async (ctx, next) => {
    // logger simulation
    const start = performance.now();
    try {
      await next();
    } finally {
      const end = performance.now();
    }
  },
  async (ctx, next) => {
    // cors simulation
    ctx.header.set("Access-Control-Allow-Origin", "*");
    await next();
  },
  async (ctx, next) => {
    // auth simulation
    ctx.executionCtx = { user: "admin" };
    await next();
  },
  (ctx) => {
    // route handler
    return new Response("Hello World");
  }
];

// Mock Context
const mockRequest = new Request("http://localhost/");
const createMockContext = () => {
  return {
    req: mockRequest,
    header: new Headers(),
    executionCtx: null,
    deferred: []
  } as unknown as Context;
};

async function runBenchmark() {
  console.log(`Warming up...`);
  const jitFn = compileHandlerChain(handlers);

  for (let i = 0; i < 1000; i++) {
    await executeHandlers(createMockContext(), handlers);
    await jitFn(createMockContext());
  }

  console.log(`Running JIT vs Non-JIT with ${iterations.toLocaleString()} iterations...\n`);

  // --- Non-JIT ---
  let nonJitStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await executeHandlers(createMockContext(), handlers);
  }
  let nonJitEnd = performance.now();
  const nonJitTime = nonJitEnd - nonJitStart;

  // --- JIT ---
  let jitStart = performance.now();
  for (let i = 0; i < iterations; i++) {
    await jitFn(createMockContext());
  }
  let jitEnd = performance.now();
  const jitTime = jitEnd - jitStart;

  console.log(`Non-JIT (executeHandlers): ${nonJitTime.toFixed(2)} ms`);
  console.log(`JIT (compileHandlerChain): ${jitTime.toFixed(2)} ms`);

  const speedup = nonJitTime / jitTime;
  console.log(`\nResult: JIT is ${speedup.toFixed(2)}x faster than Non-JIT!`);
}

runBenchmark().catch(console.error);
