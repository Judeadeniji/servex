import type { Server } from "bun";
import type { Context } from "../../context";
import { HttpException } from "../../http-exception";

export interface ServerWebSocket<T = unknown> {
	send(data: string | ArrayBuffer | Uint8Array): number;
	close(code?: number, reason?: string): void;
	subscribe(topic: string): void;
	unsubscribe(topic: string): void;
	publish(
		topic: string,
		data: string | ArrayBuffer | Uint8Array,
		compress?: boolean,
	): number;
	cork(cb: (ws: ServerWebSocket<T>) => unknown): void;
	get remoteAddress(): string;
	get readyState(): number;
	data: T;
}

export interface WebSocketHandler<T = unknown> {
	open?: (ws: ServerWebSocket<T>) => void | Promise<void>;
	message?: (
		ws: ServerWebSocket<T>,
		message: string | Buffer,
	) => void | Promise<void>;
	close?: (
		ws: ServerWebSocket<T>,
		code: number,
		reason: string,
	) => void | Promise<void>;
	drain?: (ws: ServerWebSocket<T>) => void | Promise<void>;
}

export interface WebSocketConfig {
	/** Enable compression for clients that support it. Default: false */
	perMessageDeflate?: boolean | { compress?: boolean; decompress?: boolean };
	/** The maximum size of a message. */
	maxPayloadLength?: number;
	/** After a connection has not received a message for this many seconds, it will be closed. Default: 120 */
	idleTimeout?: number;
	/** The maximum number of bytes that can be buffered for a single connection. Default: 16777216 (16MB) */
	backpressureLimit?: number;
	/** Close the connection if the backpressure limit is reached. Default: false */
	closeOnBackpressureLimit?: boolean;
}

/**
 * Creates a standalone WebSocket manager.
 * This allows adding WebSocket support without modifying the core server.
 *
 * @example
 * const { websocket, createHandler } = createWebSocketManager();
 *
 * const echoWs = createHandler({
 *   message(ws, msg) {
 *     ws.send(msg);
 *   }
 * });
 *
 * app.get('/ws', (c) => echoWs(c, { customData: 123 }));
 *
 * Bun.serve({ fetch: app.fetch, websocket });
 */
export const createWebSocketManager = (config?: WebSocketConfig) => {
	const handlers = new Map<string, WebSocketHandler>();
	let idCounter = 0;

	const websocket = {
		...config,
		open(ws: unknown) {
			const socket = ws as ServerWebSocket<{ servexWsId: string }>;
			const handlerId = socket.data?.servexWsId;
			const handler = handlers.get(handlerId);
			if (handler?.open) handler.open(socket as never);
		},
		message(ws: unknown, message: string | Buffer) {
			const socket = ws as ServerWebSocket<{ servexWsId: string }>;
			const handlerId = socket.data?.servexWsId;
			const handler = handlers.get(handlerId);
			if (handler?.message) handler.message(socket as never, message);
		},
		close(ws: unknown, code: number, reason: string) {
			const socket = ws as ServerWebSocket<{ servexWsId: string }>;
			const handlerId = socket.data?.servexWsId;
			const handler = handlers.get(handlerId);
			if (handler?.close) handler.close(socket as never, code, reason);
		},
		drain(ws: unknown) {
			const socket = ws as ServerWebSocket<{ servexWsId: string }>;
			const handlerId = socket.data?.servexWsId;
			const handler = handlers.get(handlerId);
			if (handler?.drain) handler.drain(socket as never);
		},
	};

	const createHandler = <T = unknown>(
		handler: WebSocketHandler<T & { servexWsId: string; ctx: Context }>,
	) => {
		const id = String(++idCounter);
		handlers.set(id, handler as never);

		return (c: Context, data?: Partial<T>): Response => {
			// Bun passes Server as the second parameter to fetch, which ServeX sets as `env` or `executionCtx`.
			const envServer = c.env as Server;
			const ctxServer = c.executionCtx as Server;
			const server: Server | null =
				envServer && typeof envServer.upgrade === "function"
					? envServer
					: ctxServer && typeof ctxServer.upgrade === "function"
						? ctxServer
						: null;

			if (!server || typeof server.upgrade !== "function") {
				throw new HttpException({
					statusCode: 426,
					message: "Upgrade Required: Server does not support WebSockets",
				});
			}

			const success = server.upgrade(c.req, {
				data: {
					...data,
					servexWsId: id,
					ctx: c,
				},
			});

			if (success) {
				// Return 101 Switching Protocols. Bun handles the actual upgrade behind the scenes.
				return new Response(null, { status: 101 });
			}

			throw new HttpException({
				statusCode: 500,
				message: "WebSocket upgrade failed",
			});
		};
	};

	return {
		websocket,
		createHandler,
	};
};
