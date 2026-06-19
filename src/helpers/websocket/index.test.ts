import { describe, it, expect } from "bun:test";
import { createServer } from "../../index";
import { createWebSocketManager } from "./index";

describe("Helpers: WebSocket", () => {
  it("should upgrade connection and handle messages", async () => {
    const { websocket, createHandler } = createWebSocketManager();
    
    const echoWs = createHandler({
      message(ws, msg) {
        ws.send(`echo: ${msg}`);
      }
    });

    const app = createServer();
    app.get("/ws", (c) => echoWs(c));

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket
    });

    const url = `ws://localhost:${server.port}/ws`;
    
    const messages: string[] = [];
    const ws = new WebSocket(url);
    
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => ws.send("hello servex");
      ws.onmessage = (e) => {
        messages.push(e.data);
        ws.close();
        resolve();
      };
      ws.onerror = (e) => reject(e);
    });

    server.stop();
    expect(messages).toEqual(["echo: hello servex"]);
  });

  it("should pass custom data and Context through ws.data", async () => {
    const { websocket, createHandler } = createWebSocketManager();
    
    let capturedData: any = null;
    let hasContext = false;

    const dataWs = createHandler<{ userId: number }>({
      open(ws) {
        capturedData = ws.data.userId;
        hasContext = !!ws.data.ctx;
        ws.send("ready");
      }
    });

    const app = createServer();
    app.get("/ws/:id", (c) => dataWs(c, { userId: Number(c.params("id")) }));

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket
    });

    const ws = new WebSocket(`ws://localhost:${server.port}/ws/42`);
    
    await new Promise<void>((resolve, reject) => {
      ws.onmessage = () => {
        ws.close();
        resolve();
      };
      ws.onerror = (e) => reject(e);
    });

    server.stop();
    expect(capturedData).toBe(42);
    expect(hasContext).toBe(true);
  });

  it("should return 426 Upgrade Required if not running in a WebSocket-capable server", async () => {
    const { createHandler } = createWebSocketManager();
    
    const ws = createHandler({});

    const app = createServer();
    app.get("/ws", (c) => ws(c));

    // Simulate standard request without passing the server object
    const res = await app.request("http://localhost/ws");
    
    expect(res.status).toBe(426);
    expect(await res.text()).toContain("Upgrade Required");
  });
});
