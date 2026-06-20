import { compileHandlerChain } from "../src/compiler/index";
import { executeHandlers } from "../src/core/response";
import { Context } from "../src/context";
import type { Handler } from "../src/types";

const ITERATIONS = 1_000_000;

function generateChain(length: number): Handler<Context>[] {
  const chain: Handler<Context>[] = [];
  for (let i = 0; i < length - 1; i++) {
    chain.push(async (ctx: Context, next: any) => {
      (ctx as any).count = ((ctx as any).count || 0) + 1;
      await next();
    });
  }
  chain.push(async (ctx: Context) => new Response("OK"));
  return chain;
}

async function runBench() {
  const mockContext = { count: 0 } as unknown as Context;
  
  for (const len of [1, 3, 8, 20]) {
    console.log(`\n=== Chain Length: ${len} ===`);
    const handlers = generateChain(len);
    
    const compiledFn = compileHandlerChain(handlers);
    
    // Warmup
    for(let i=0; i<1000; i++) {
      await executeHandlers(mockContext, handlers);
      await compiledFn(mockContext);
    }
    
    let start = performance.now();
    for(let i=0; i<ITERATIONS; i++) {
      await executeHandlers(mockContext, handlers);
    }
    let end = performance.now();
    const nonJitTime = end - start;
    console.log(`Non-JIT executeHandlers: ${nonJitTime.toFixed(2)}ms`);
    
    start = performance.now();
    for(let i=0; i<ITERATIONS; i++) {
      await compiledFn(mockContext);
    }
    end = performance.now();
    const jitTime = end - start;
    console.log(`JIT compileHandlerChain: ${jitTime.toFixed(2)}ms`);
    console.log(`Speedup: ${(nonJitTime / jitTime).toFixed(2)}x`);
  }
}

runBench();
