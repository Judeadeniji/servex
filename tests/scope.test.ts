import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";

describe("Concurrency and Scope", () => {
  it("should not leak request context across concurrent requests (concurrency test)", async () => {
    const app = createServer();
    let leakedContext = false;

    app.get("/slow", async (c) => {
      // Set a unique value for the slow request
      c.set("id", "slow-req");
      
      // Yield to the event loop, allowing /fast to run
      await new Promise(r => setTimeout(r, 20));
      
      // If Context wasn't isolated, /fast might have overwritten this!
      if (c.get("id") !== "slow-req") {
        leakedContext = true;
      }
      
      return c.text("slow");
    });

    app.get("/fast", async (c) => {
      // Set a different value
      c.set("id", "fast-req");
      return c.text("fast");
    });

    // Fire both concurrently
    const pSlow = app.fetch(new Request("http://localhost/slow"));
    
    // Give /slow 5ms to start its await
    await new Promise(r => setTimeout(r, 5));
    
    // Fire /fast while /slow is waiting
    const pFast = app.fetch(new Request("http://localhost/fast"));

    await Promise.all([pSlow, pFast]);

    // Expect no leakage!
    expect(leakedContext).toBe(false);
  });
});
