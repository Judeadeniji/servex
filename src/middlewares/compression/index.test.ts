import { describe, expect, it } from "bun:test";
import { createServer } from "../../app";
import { compression } from "./index";

describe("Middleware: Compression", () => {
  it("should compress response with gzip if client supports it", async () => {
    const app = createServer();
    app.use(compression({ threshold: 0 }));
    app.get("/", () => new Response("Hello World"));

    const req = new Request("http://localhost/", {
      headers: { "Accept-Encoding": "gzip, deflate, br" },
    });
    const res = await app.request(req);

    expect(res.headers.get("Content-Encoding")).toBe("gzip");
    expect(res.headers.get("Vary")).toContain("Accept-Encoding");
    expect(res.headers.has("Content-Length")).toBe(false);
  });

  it("should compress response with deflate if client supports only deflate", async () => {
    const app = createServer();
    app.use(compression({ threshold: 0 }));
    app.get("/", () => new Response("Hello World"));

    const req = new Request("http://localhost/", {
      headers: { "Accept-Encoding": "deflate" },
    });
    const res = await app.request(req);

    expect(res.headers.get("Content-Encoding")).toBe("deflate");
  });

  it("should not compress if client does not support gzip or deflate", async () => {
    const app = createServer();
    app.use(compression({ threshold: 0 }));
    app.get("/", () => new Response("Hello World"));

    const req = new Request("http://localhost/", {
      headers: { "Accept-Encoding": "br" }, // we don't support br yet
    });
    const res = await app.request(req);

    expect(res.headers.has("Content-Encoding")).toBe(false);
  });

  it("should not compress if response is below threshold", async () => {
    const app = createServer();
    app.use(compression({ threshold: 100 }));
    app.get("/", () => new Response("Hello World", { headers: { "Content-Length": "11" } }));

    const req = new Request("http://localhost/", {
      headers: { "Accept-Encoding": "gzip" },
    });
    const res = await app.request(req);

    expect(res.headers.has("Content-Encoding")).toBe(false);
    expect(res.headers.get("Content-Length")).toBe("11");
  });

  it("should not compress if response already has Content-Encoding", async () => {
    const app = createServer();
    app.use(compression({ threshold: 0 }));
    app.get("/", () => new Response("Hello World", { headers: { "Content-Encoding": "custom" } }));

    const req = new Request("http://localhost/", {
      headers: { "Accept-Encoding": "gzip" },
    });
    const res = await app.request(req);

    expect(res.headers.get("Content-Encoding")).toBe("custom");
  });
});
