import { describe, it, expect, beforeAll } from "vitest";
import { createServer, ServeXRequest } from "./index";
import { HttpException } from "./http-exception";

describe("ServeX", () => {
  let server: ReturnType<typeof createServer>;
  beforeAll(() => {
    server = createServer();

    server.get("/", (c) => {
      return c.text("Hello, world!");
    });

    server.use((c, next) => {
      c.setHeaders({
        "X-Custom-Header": "test",
      });
      next();
    });
  });
  it("should create a server instance", () => {
    expect(server).toBeDefined();
  });

  it("should handle a request", async () => {
    const request = new ServeXRequest(new URL("http://localhost/"));
    const response = await server.request(request);
    expect(response.status).toBe(200);
  });

  it("should throw HttpException for invalid routes", async () => {
    const request = new ServeXRequest(new URL("http://localhost/invalid"));
    try {
      await server.request(request);
    } catch (e) {
      const error = e as HttpException;
      expect(error).toBeInstanceOf(HttpException);
      expect(error.statusCode).toBe(404);
    }
  });

  it("should use middleware correctly", async () => {
    const request = new ServeXRequest("http://localhost/");
    const response = await server.request(request);
    console.log(response.headers);
    expect(response.headers.get("X-Custom-Header")).toBe("test");
  });
});
