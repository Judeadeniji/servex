import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";

describe("Deferred Tasks", () => {
  it("should execute deferred tasks after the response is sent", async () => {
    const app = createServer();
    let deferredRan = false;

    app.get("/", (c) => {
      c.defer(async () => {
        await new Promise((r) => setTimeout(r, 10)); // tiny delay
        deferredRan = true;
      });
      return c.text("OK");
    });

    const res = await app.fetch(new Request("http://localhost/"));
    expect(await res.text()).toBe("OK");

    // Immediately after fetch returns, it should be false (because of the delay)
    expect(deferredRan).toBe(false);

    // Wait a bit for the background task to run
    await new Promise((r) => setTimeout(r, 20));
    expect(deferredRan).toBe(true);
  });

  it("should not block the response if the deferred task throws an error", async () => {
    const app = createServer();

    app.get("/", (c) => {
      c.defer(() => {
        throw new Error("Deferred task failed");
      });
      return c.text("OK");
    });

    const res = await app.fetch(new Request("http://localhost/"));
    expect(await res.text()).toBe("OK");
  });

  it("should integrate with Cloudflare-style executionCtx.waitUntil", async () => {
    const app = createServer();
    let deferredRan = false;
    let waitUntilCalled = false;

    const mockExecutionCtx = {
      waitUntil(promise: Promise<any>) {
        waitUntilCalled = true;
        return promise;
      }
    };

    app.get("/", (c) => {
      c.defer(() => {
        deferredRan = true;
      });
      return c.text("OK");
    });

    const res = await app.fetch(new Request("http://localhost/"), undefined, mockExecutionCtx);
    expect(await res.text()).toBe("OK");
    expect(waitUntilCalled).toBe(true);

    // Since the mock waitUntil is just a sink and we didn't block on the promise, 
    // it executes as a microtask synchronously or shortly after.
    await new Promise((r) => setTimeout(r, 5));
    expect(deferredRan).toBe(true);
  });
});
