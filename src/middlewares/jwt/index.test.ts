import { describe, it, expect } from "bun:test";
import { jwt } from "./index";
import { sign } from "../../helpers/jwt";
import { createServer } from "../../../src";

describe("Middleware: JWT", () => {
  const SECRET = "super-secret-key-12345";

  it("should allow request with valid Bearer token and set jwtPayload", async () => {
    const app = createServer();
    app.use(jwt({ secret: SECRET }));
    app.get("/", (c) => {
      const payload = c.get("jwtPayload") as any;
      return c.json({ user: payload.user });
    });

    const token = await sign({ user: "admin" }, SECRET);
    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "Authorization": `Bearer ${token}` }
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "admin" });
  });

  it("should block request without token", async () => {
    const app = createServer();
    app.use(jwt({ secret: SECRET }));
    app.get("/", (c) => c.text("OK"));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Unauthorized");
  });

  it("should block request with invalid token", async () => {
    const app = createServer();
    app.use(jwt({ secret: SECRET }));
    app.get("/", (c) => c.text("OK"));

    const token = await sign({ user: "admin" }, "wrong-secret");
    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "Authorization": `Bearer ${token}` }
    }));

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("Invalid JWT signature");
  });

  it("should extract token from cookie if configured", async () => {
    const app = createServer();
    app.use(jwt({ secret: SECRET, cookie: "auth_token" }));
    app.get("/", (c) => {
      const payload = c.get("jwtPayload") as any;
      return c.json({ user: payload.user });
    });

    const token = await sign({ user: "admin" }, SECRET);
    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "Cookie": `auth_token=${token}` }
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: "admin" });
  });

  it("should execute onFail callback on error", async () => {
    const app = createServer();
    app.use(jwt({ 
      secret: SECRET,
      onFail: (c, err) => c.json({ error: "Custom message: " + err.message }, 403)
    }));
    app.get("/", (c) => c.text("OK"));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Custom message: Missing JWT token" });
  });
});
