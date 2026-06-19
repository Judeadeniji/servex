import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";
import { Hono } from "hono";
import { Elysia } from "elysia";

describe("Mounting WinterTC apps (Hono & Elysia)", () => {
  it("should support mounting a sub-app instance via .route()", async () => {
    const subApp = createServer();
    subApp.get("/hello", (c) => c.text("world"));

    const mainApp = createServer();
    mainApp.route("/api", subApp);

    const res = await mainApp.fetch(new Request("http://localhost/api/hello"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("world");
  });

  it("should mount Hono using .mount()", async () => {
    const app = createServer()
        .get("/", (c) => c.text("ServeX Root"));
    
    const hono = new Hono()
      .get("/", (c) => c.text("Hono Root"))
      .get("/hello", (c) => c.text("Hono Hello"));

    // Mount Hono
    app.mount("/hono", hono.fetch);

    // Root request handled by ServeX
    const resRoot = await app.request("http://localhost/");
    expect(resRoot.status).toBe(200);
    expect(await resRoot.text()).toBe("ServeX Root");

    // Exact mount path handled by Hono
    const resHono = await app.request("http://localhost/hono");
    expect(resHono.status).toBe(200);
    expect(await resHono.text()).toBe("Hono Root");

    // Sub-path handled by Hono
    const resHonoApi = await app.request("http://localhost/hono/hello");
    expect(resHonoApi.status).toBe(200);
    expect(await resHonoApi.text()).toBe("Hono Hello");
  });

  it("should mount Elysia using .mount()", async () => {
    const app = createServer();
    
    const elysia = new Elysia()
      .get("/", () => "Elysia Root")
      .get("/hello", () => "Elysia Hello");

    // Mount Elysia
    app.mount("/elysia", elysia.fetch);

    // Exact mount path handled by Elysia
    const resElysia = await app.request("http://localhost/elysia");
    expect(resElysia.status).toBe(200);
    expect(await resElysia.text()).toBe("Elysia Root");

    // Sub-path handled by Elysia
    const resElysiaApi = await app.request("http://localhost/elysia/hello");
    expect(resElysiaApi.status).toBe(200);
    expect(await resElysiaApi.text()).toBe("Elysia Hello");
  });

  it("should pass env and executionCtx to mounted fetch functions", async () => {
    let capturedEnv: any;
    let capturedCtx: any;

    const mockFetchWithEnv = (req: Request, env?: any, ctx?: any) => {
      capturedEnv = env;
      capturedCtx = ctx;
      return new Response("OK");
    };

    const app = createServer();
    app.mount("/mounted", mockFetchWithEnv);

    await app.fetch(
      new Request("http://localhost/mounted/test"),
      { secret: "123" },
      { waitUntil: () => {} }
    );

    expect(capturedEnv).toEqual({ secret: "123" });
    expect(capturedCtx.waitUntil).toBeDefined();
  });
});
