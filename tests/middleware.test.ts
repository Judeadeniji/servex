import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";

describe("Middleware", () => {
  it("should execute global middleware", async () => {
    const app = createServer();

    app.use("*", async (c, next) => {
      c.setHeaders({ "X-Global": "true" });
      return next();
    });

    app.get("/", (c) => c.text("OK"));

    const req = new Request("http://localhost/");
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Global")).toBe("true");
  });

  it("should execute route-specific middleware", async () => {
    const app = createServer();
    
    const authMiddleware = async (c: any, next: any) => {
      if (c.req.headers.get("Authorization") !== "Bearer token") {
        return c.text("Unauthorized", 401);
      }
      return next();
    };

    app.get("/protected", authMiddleware, (c) => c.text("Secret"));

    const req1 = new Request("http://localhost/protected");
    const res1 = await app.fetch(req1);
    expect(res1.status).toBe(401);

    const req2 = new Request("http://localhost/protected", {
      headers: { "Authorization": "Bearer token" }
    });
    const res2 = await app.fetch(req2);
    expect(res2.status).toBe(200);
    expect(await res2.text()).toBe("Secret");
  });

  it("should short-circuit if next() is not called", async () => {
    const app = createServer();
    app.use("*", async (c) => {
      return c.text("Blocked by middleware", 403);
    });
    app.get("/target", (c) => c.text("Target reached"));

    const res = await app.fetch(new Request("http://localhost/target"));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Blocked by middleware");
  });

  it("should chain multiple middlewares and pass values via Context state", async () => {
    const app = createServer();
    app.use("*", async (c, next) => {
      c.setHeaders({ "X-Mid-1": "1" });
      await next();
    });
    app.use("*", async (c, next) => {
      c.setHeaders({ "X-Mid-2": "2" });
      await next();
    });
    app.get("/test", (c) => c.text("Chain OK"));

    const res = await app.fetch(new Request("http://localhost/test"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Mid-1")).toBe("1");
    expect(res.headers.get("X-Mid-2")).toBe("2");
    expect(await res.text()).toBe("Chain OK");
  });
});
