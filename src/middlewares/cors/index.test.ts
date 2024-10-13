import { describe, it, expect } from "bun:test";
import { createServer } from "../..";
import { RouterType } from "../../router/adapter";
import { route } from "../../router";
import { cors } from ".";


describe("CORS via middleware", () => {
  const genRoute = route("GET /api/abc", async (c) => {
    return c.json({ success: true });
  }, {
    middlewares: [
      cors({
        origin: "*",
        exposeHeaders: ["X-Pam"]
      })
    ]
  });

  const api2Route = route("GET /api2/abc", async (c) => {
    return c.json({ success: true });
  });

  const server = createServer({
    router: RouterType.RADIX,
    routes: [genRoute, api2Route],
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
