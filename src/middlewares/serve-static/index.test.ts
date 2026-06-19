import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { serveStatic } from "./index";
import { createServer } from "../../../src";
import fs from "node:fs/promises";
import path from "node:path";

const PUBLIC_DIR = path.join(__dirname, ".test_public");

describe("Middleware: Serve Static", () => {
  beforeAll(async () => {
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
    await fs.writeFile(path.join(PUBLIC_DIR, "index.html"), "<h1>Home</h1>");
    await fs.writeFile(path.join(PUBLIC_DIR, "style.css"), "body { color: red; }");
  });

  afterAll(async () => {
    await fs.rm(PUBLIC_DIR, { recursive: true, force: true });
  });

  it("should serve a specific file and infer MIME type", async () => {
    const app = createServer();
    app.use(serveStatic({ root: PUBLIC_DIR }));

    const res = await app.fetch(new Request("http://localhost/style.css"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/css");
    expect(await res.text()).toBe("body { color: red; }");
  });

  it("should default to index.html for root requests", async () => {
    const app = createServer();
    app.use(serveStatic({ root: PUBLIC_DIR }));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toBe("<h1>Home</h1>");
  });

  it("should call next() if file is not found (allowing 404 handler)", async () => {
    const app = createServer();
    app.use(serveStatic({ root: PUBLIC_DIR }));
    app.get("*", (c) => c.text("Fallback Not Found", 404));

    const res = await app.fetch(new Request("http://localhost/missing.txt"));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Fallback Not Found");
  });

  it("should normalize directory traversal attempts and return 404", async () => {
    const app = createServer();
    app.use(serveStatic({ root: PUBLIC_DIR }));

    const res = await app.fetch(new Request("http://localhost/../../package.json"));
    expect(res.status).toBe(404);
  });

  it("should skip non-GET/HEAD requests", async () => {
    const app = createServer();
    app.use(serveStatic({ root: PUBLIC_DIR }));
    app.post("/style.css", (c) => c.text("Handled POST"));

    const res = await app.fetch(new Request("http://localhost/style.css", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Handled POST");
  });
});
