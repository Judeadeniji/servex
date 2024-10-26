import { describe, it, expect } from "bun:test";
import { createServer } from "../..";
import { RouterType } from "../../router/adapter";
import { cors } from ".";


describe("CORS via middleware", () => {
  
  const server = createServer({
    router: RouterType.RADIX,
  });


  server.get("GET /api/abc", cors({
    origin: "*",
    exposeHeaders: ["X-Pam"]
  }), async (c) => {
    return c.json({ success: true });
  });
  
  server.get("/api2/abc", async (c) => {
      return c.json({ success: true });
    });

  server.use(async (c, n) => {
    console.log("Middleware 1");
    await n();
    console.log("Middleware 1 after");
  });

  server.use("/api/*", async (c, n) => {
    console.log("Middleware 2");
    await n();
    console.log("Middleware 2 after");
  });

  it("should GET default", async () => {
    const res = await server.request("http://localhost/api/abc");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Vary")).toBeNull();
  });
});
