import { describe, it, expect, mock } from "bun:test";
import { logger } from "./index";
import { createServer } from "../../../src";

describe("Middleware: Logger", () => {
  it("should log requests with default format", async () => {
    const printMock = mock((str: string) => {});
    const app = createServer();
    
    app.use(logger({ print: printMock }));
    app.get("/ping", (c) => c.text("pong", 201));

    await app.fetch(new Request("http://localhost/ping"));
    await Bun.sleep(1);

    expect(printMock).toHaveBeenCalled();
    const logOutput = printMock.mock.calls[0][0] as string;
    
    expect(logOutput).toContain("GET");
    expect(logOutput).toContain("/ping");
    expect(logOutput).toContain("201");
    expect(logOutput).toContain("ms");
  });

  it("should log errors correctly with correct status code", async () => {
    const printMock = mock((str: string) => {});
    const app = createServer();
    
    app.use(logger({ print: printMock }));
    app.get("/error", () => { throw new Error("Boom"); });

    await app.fetch(new Request("http://localhost/error"));
    await Bun.sleep(1);

    expect(printMock).toHaveBeenCalled();
    const logOutput = printMock.mock.calls[0][0] as string;
    
    expect(logOutput).toContain("GET");
    expect(logOutput).toContain("/error");
    expect(logOutput).toContain("500");
  });

  it("should use a custom format function if provided", async () => {
    const printMock = mock((str: string) => {});
    const formatMock = mock((data) => `CUSTOM ${data.method} ${data.path} ${data.status}`);
    
    const app = createServer();
    app.use(logger({ print: printMock, format: formatMock }));
    app.post("/custom", (c) => c.text("ok", 202));

    await app.fetch(new Request("http://localhost/custom", { method: "POST" }));
    await Bun.sleep(1);

    expect(formatMock).toHaveBeenCalled();
    const logOutput = printMock.mock.calls[0][0] as string;
    expect(logOutput).toBe("CUSTOM POST /custom 202");
  });
});
