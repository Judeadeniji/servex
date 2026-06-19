import { describe, it, expect } from "bun:test";
import { createServer } from "../..";
import { RouterType } from "../../router/adapter";
import { cors } from ".";

describe("Middleware: CORS", () => {
  it("should handle basic GET request with default options (*)", async () => {
    const app = createServer();
    app.use(cors());
    app.get("/", (c) => c.text("OK"));

    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Vary")).toBeNull();
  });

  it("should handle specific origin and set Vary: Origin", async () => {
    const app = createServer();
    app.use(cors({ origin: "https://example.com" }));
    app.get("/", (c) => c.text("OK"));

    const res = await app.fetch(new Request("http://localhost/", {
      headers: { "Origin": "https://example.com" }
    }));
    
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("should handle OPTIONS preflight requests", async () => {
    const app = createServer();
    app.use(cors({
      origin: "https://example.com",
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["X-Custom-Header"],
      maxAge: 86400,
      credentials: true
    }));

    const res = await app.fetch(new Request("http://localhost/", {
      method: "OPTIONS",
      headers: { 
        "Origin": "https://example.com",
        "Access-Control-Request-Headers": "X-Custom-Header"
      }
    }));
    
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("X-Custom-Header");
    expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(res.headers.get("Vary")).toContain("Origin");
    expect(res.headers.get("Vary")).toContain("Access-Control-Request-Headers");
  });

  it("should dynamically allow multiple origins from array", async () => {
    const app = createServer();
    app.use(cors({ origin: ["https://a.com", "https://b.com"] }));
    app.get("/", (c) => c.text("OK"));

    const resA = await app.fetch(new Request("http://localhost/", {
      headers: { "Origin": "https://a.com" }
    }));
    expect(resA.headers.get("Access-Control-Allow-Origin")).toBe("https://a.com");

    const resC = await app.fetch(new Request("http://localhost/", {
      headers: { "Origin": "https://c.com" }
    }));
    // Should fallback to the first allowed origin if it doesn't match
    expect(resC.headers.get("Access-Control-Allow-Origin")).toBe("https://a.com");
  });

  it("should dynamically allow origin using a function", async () => {
    const app = createServer();
    app.use(cors({ 
      origin: (origin) => origin.endsWith(".example.com") ? origin : "https://example.com" 
    }));
    app.get("/", (c) => c.text("OK"));

    const resMatch = await app.fetch(new Request("http://localhost/", {
      headers: { "Origin": "https://sub.example.com" }
    }));
    expect(resMatch.headers.get("Access-Control-Allow-Origin")).toBe("https://sub.example.com");

    const resNoMatch = await app.fetch(new Request("http://localhost/", {
      headers: { "Origin": "https://attacker.com" }
    }));
    expect(resNoMatch.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com");
  });
});
