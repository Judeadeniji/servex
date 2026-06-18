import { describe, it, expect } from "bun:test";
import { Context } from "../src/context";

describe("Context", () => {
  it("should create JSON response", () => {
    const req = new Request("http://localhost/");
    const ctx = new Context(req, {}, { parsedBody: null, params: {}, query: new URLSearchParams() });
    
    const res = ctx.json({ message: "Success" }, 201, { "X-Custom": "1" });
    
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
    expect(res.headers.get("X-Custom")).toBe("1");
  });

  it("should create HTML response", () => {
    const req = new Request("http://localhost/");
    const ctx = new Context(req, {}, { parsedBody: null, params: {}, query: new URLSearchParams() });
    
    const res = ctx.html("<h1>Hello</h1>");
    
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=UTF-8");
  });

  it("should set cookies", () => {
    const req = new Request("http://localhost/");
    const ctx = new Context(req, {}, { parsedBody: null, params: {}, query: new URLSearchParams() });
    
    ctx.setCookie("session", "12345");
    const res = ctx.text("OK");
    
    expect(res.headers.get("Set-Cookie")).toContain("session=12345");
  });

  it("should redirect", () => {
    const req = new Request("http://localhost/");
    const ctx = new Context(req, {}, { parsedBody: null, params: {}, query: new URLSearchParams() });
    
    const res = ctx.redirect("/login", 301);
    
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/login");
  });

  it("should parse formData", async () => {
    const formData = new FormData();
    formData.append("key", "value");
    
    const req = new Request("http://localhost/", {
      method: "POST",
      body: formData
    });
    
    const ctx = new Context(req, {}, { parsedBody: undefined, params: {}, query: new URLSearchParams() });
    const parsed = await ctx.formData();
    expect(parsed.get("key")).toBe("value");
  });

  it("should parse urlEncoded", async () => {
    const req = new Request("http://localhost/", {
      method: "POST",
      body: "key=value&foo=bar",
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    
    const ctx = new Context(req, {}, { parsedBody: undefined, params: {}, query: new URLSearchParams() });
    const parsed = await ctx.urlEncoded();
    expect(parsed.get("key")).toBe("value");
    expect(parsed.get("foo")).toBe("bar");
  });

  it("should create stream response", () => {
    const req = new Request("http://localhost/");
    const ctx = new Context(req, {}, { parsedBody: null, params: {}, query: new URLSearchParams() });
    
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue("chunk");
        controller.close();
      }
    });
    
    const res = ctx.stream(stream);
    
    expect(res.status).toBe(200);
    expect(res.headers.get("Transfer-Encoding")).toBe("chunked");
  });
});
