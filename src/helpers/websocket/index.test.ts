import { describe, expect, it } from "bun:test";
import { createServer } from "../../index";
import { createWebSocketManager } from "./index";

describe("Helpers: WebSocket", () => {
	it("should upgrade connection and handle messages", async () => {
		const { websocket, createHandler } = createWebSocketManager();

		const echoWs = createHandler({
			message(ws, msg) {
				ws.send(`echo: ${msg}`);
			},
		});

		const app = createServer();
		app.get("/ws", (c) => echoWs(c));

		const server = Bun.serve({
			port: 0,
			fetch: app.fetch,
			websocket,
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

		let capturedData: unknown = null;
		let hasContext = false;

		const dataWs = createHandler<{ userId: number }>({
			open(ws) {
				capturedData = ws.data.userId;
				hasContext = !!ws.data.ctx;
				ws.send("ready");
			},
		});

		const app = createServer();
		app.get("/ws/:id", (c) => dataWs(c, { userId: Number(c.params("id")) }));

		const server = Bun.serve({
			port: 0,
			fetch: app.fetch,
			websocket,
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

	it("should pass configuration options to the websocket object", () => {
		const config = {
			idleTimeout: 30,
			maxPayloadLength: 1024,
			perMessageDeflate: true,
			backpressureLimit: 512,
			closeOnBackpressureLimit: true,
		};

		const { websocket } = createWebSocketManager(config);

		// Verify all config properties are correctly mapped onto the websocket object
		expect(websocket.idleTimeout).toBe(30);
		expect(websocket.maxPayloadLength).toBe(1024);
		expect(websocket.perMessageDeflate).toBe(true);
		expect(websocket.backpressureLimit).toBe(512);
		expect(websocket.closeOnBackpressureLimit).toBe(true);

		// Also verify the methods still exist
		expect(typeof websocket.open).toBe("function");
		expect(typeof websocket.message).toBe("function");
		expect(typeof websocket.close).toBe("function");
		expect(typeof websocket.drain).toBe("function");
	});

	it("should enforce configuration (e.g., maxPayloadLength) at the engine level", async () => {
		// We set a ridiculously small payload length to trigger the engine's internal rejection
		const { websocket, createHandler } = createWebSocketManager({
			maxPayloadLength: 10, // 10 bytes max
		});

		const wsHandler = createHandler({
			message(ws, _msg) {
				ws.send("ok");
			},
		});

		const app = createServer();
		app.get("/ws-limit", (c) => wsHandler(c));

		const server = Bun.serve({
			port: 0,
			fetch: app.fetch,
			websocket,
		});

		const url = `ws://localhost:${server.port}/ws-limit`;
		const ws = new WebSocket(url);

		let closeCode = 0;

		await new Promise<void>((resolve, reject) => {
			ws.onopen = () => {
				// Send an 11 byte string, which exceeds the 10 byte maxPayloadLength
				ws.send("hello world"); // 11 characters
			};
			ws.onmessage = () => {
				reject(new Error("Message should not have been received"));
			};
			ws.onclose = (e) => {
				closeCode = e.code;
				resolve();
			};
			ws.onerror = () => {
				// an error might be emitted before closing depending on the environment
			};
		});

		server.stop();

		// Depending on the engine's exact abrupt closure behavior, it might be 1009 or 1006 (Abnormal Closure)
		expect([1009, 1006]).toContain(closeCode);
	});
});
