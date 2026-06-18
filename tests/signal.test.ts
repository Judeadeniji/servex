import { describe, it, expect } from "bun:test";
import { background, withValue, withCancel, withTimeout } from "../src/core/signal";
import { createServer } from "../src/index";

describe("Signal Context", () => {
  it("should store and retrieve values", () => {
    const root = background();
    const ctx1 = withValue(root, "k1", "v1");
    const ctx2 = withValue(ctx1, "k2", "v2");

    expect(ctx2.value<string>("k1")).toBe("v1");
    expect(ctx2.value<string>("k2")).toBe("v2");
    expect(ctx2.value("k3")).toBeUndefined();
    expect(root.value("k1")).toBeUndefined(); // Immutable upstream
  });

  it("should propagate cancellation", () => {
    const root = background();
    const [ctx1, cancel1] = withCancel(root);
    const [ctx2] = withCancel(ctx1);

    expect(ctx1.done).toBe(false);
    expect(ctx2.done).toBe(false);

    cancel1();

    expect(ctx1.done).toBe(true);
    expect(ctx2.done).toBe(true); // Child should be cancelled when parent is cancelled
  });

  it("should trigger timeout cancellation", async () => {
    const root = background();
    const [ctx, cancel] = withTimeout(root, 10);
    
    expect(ctx.done).toBe(false);
    
    await new Promise((resolve) => setTimeout(resolve, 20));
    
    expect(ctx.done).toBe(true);
    expect(String(ctx.error)).toContain("context deadline exceeded");
    
    cancel(); // Safe to call after timeout
  });

  it("should pass request-scoped values through middleware", async () => {
    const app = createServer();
    
    app.use("*", async (c, next) => {
      c.routine = withValue(c.routine, "user", { id: 42 });
      await next();
    });

    app.get("/user", (c) => {
      const user = c.routine.value<{ id: number }>("user");
      return c.json(user!);
    });

    const req = new Request("http://localhost/user");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 42 });
  });

  it("should cancel routine when request aborts", async () => {
    const app = createServer();
    let isCancelled = false;

    app.get("/long", async (c) => {
      // Simulate long polling
      await new Promise((r) => setTimeout(r, 20));
      isCancelled = c.routine.done;
      return c.text("Done");
    });

    const controller = new AbortController();
    const req = new Request("http://localhost/long", { signal: controller.signal });
    
    const fetchPromise = app.fetch(req);
    
    // Abort the request halfway through
    setTimeout(() => {
      controller.abort();
    }, 5);

    await fetchPromise;
    expect(isCancelled).toBe(true);
  });
});
