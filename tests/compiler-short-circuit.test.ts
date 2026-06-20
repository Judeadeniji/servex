import { describe, it, expect } from "bun:test";
import { compileHandlerChain } from "../src/compiler/index";
import { Context } from "../src/context";

const mockRequest = new Request("http://localhost/");
const createMockContext = () => ({
  req: mockRequest,
  header: new Headers(),
  executionCtx: null,
  deferred: []
} as unknown as Context);

describe("JIT Compiler - Short Circuiting & Edge Cases", () => {
  it("Index 0: Short-circuits correctly", async () => {
    const handlers = [
      async () => new Response("0"),
      async (ctx: any, next: any) => { throw new Error("Should not reach"); }
    ];
    const fn = compileHandlerChain(handlers);
    const res = await fn(createMockContext());
    expect(res?.status).toBe(200);
    expect(await res!.text()).toBe("0");
  });

  it("Index Middle: Short-circuits correctly", async () => {
    const handlers = [
      async (ctx: any, next: any) => { await next(); },
      async () => new Response("1"),
      async (ctx: any, next: any) => { throw new Error("Should not reach"); }
    ];
    const fn = compileHandlerChain(handlers);
    const res = await fn(createMockContext());
    expect(res?.status).toBe(200);
    expect(await res!.text()).toBe("1");
  });

  it("Index Last: Resolves properly", async () => {
    const handlers = [
      async (ctx: any, next: any) => { await next(); },
      async (ctx: any, next: any) => { await next(); },
      async () => new Response("2")
    ];
    const fn = compileHandlerChain(handlers);
    const res = await fn(createMockContext());
    expect(res?.status).toBe(200);
    expect(await res!.text()).toBe("2");
  });

  it("Error Throw: Propagates correctly", async () => {
    const handlers = [
      async (ctx: any, next: any) => { 
        try { 
          await next(); 
        } catch (e: any) { 
          return new Response(e.message, {status: 500}); 
        }
      },
      async (ctx: any, next: any) => { throw new Error("Mid-chain error"); },
      async (ctx: any, next: any) => { throw new Error("Should not reach"); }
    ];
    const fn = compileHandlerChain(handlers);
    const res = await fn(createMockContext());
    expect(res?.status).toBe(500);
    expect(await res!.text()).toBe("Mid-chain error");
  });

  it("No Response: Resolves to undefined", async () => {
    const handlers = [
      async (ctx: any, next: any) => { await next(); },
      async (ctx: any, next: any) => { await next(); }
    ];
    const fn = compileHandlerChain(handlers);
    const res = await fn(createMockContext());
    expect(res).toBeUndefined();
  });
});

