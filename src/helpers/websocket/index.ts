import type { Server } from "bun";
import type { Context } from "../../context";
import { HttpException } from "../../http-exception";

export interface ServerWebSocket<T = any> {
  send(data: string | ArrayBuffer | Uint8Array): number;
  close(code?: number, reason?: string): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  publish(topic: string, data: string | ArrayBuffer | Uint8Array, compress?: boolean): number;
  cork(cb: (ws: ServerWebSocket<T>) => any): void;
  get remoteAddress(): string;
  get readyState(): number;
  data: T;
}

export interface WebSocketHandler<T = any> {
  open?: (ws: ServerWebSocket<T>) => void | Promise<void>;
  message?: (ws: ServerWebSocket<T>, message: string | Buffer) => void | Promise<void>;
  close?: (ws: ServerWebSocket<T>, code: number, reason: string) => void | Promise<void>;
  drain?: (ws: ServerWebSocket<T>) => void | Promise<void>;
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
export const createWebSocketManager = () => {
  const handlers = new Map<string, WebSocketHandler>();
  let idCounter = 0;

  const websocket = {
    open(ws: any) {
      const handlerId = ws.data?.servexWsId;
      const handler = handlers.get(handlerId);
      if (handler?.open) handler.open(ws);
    },
    message(ws: any, message: string | Buffer) {
      const handlerId = ws.data?.servexWsId;
      const handler = handlers.get(handlerId);
      if (handler?.message) handler.message(ws, message);
    },
    close(ws: any, code: number, reason: string) {
      const handlerId = ws.data?.servexWsId;
      const handler = handlers.get(handlerId);
      if (handler?.close) handler.close(ws, code, reason);
    },
    drain(ws: any) {
      const handlerId = ws.data?.servexWsId;
      const handler = handlers.get(handlerId);
      if (handler?.drain) handler.drain(ws);
    }
  };

  const createHandler = <T = any>(handler: WebSocketHandler<T & { servexWsId: string, ctx: Context }>) => {
    const id = String(++idCounter);
    handlers.set(id, handler as any);

    return (c: Context, data?: Partial<T>): Response => {
      // Bun passes Server as the second parameter to fetch, which ServeX sets as `env` or `executionCtx`.
      const server: Server | null = (c.env && (c.env as Server).upgrade) ? c.env : ((c.executionCtx && (c.executionCtx as Server).upgrade) ? c.executionCtx : null);

      if (!server || typeof server.upgrade !== "function") {
        throw new HttpException({
          statusCode: 426,
          message: "Upgrade Required: Server does not support WebSockets"
        });
      }

      const success = server.upgrade(c.req, {
        data: {
          ...data,
          servexWsId: id,
          ctx: c
        }
      });

      if (success) {
        // Return 101 Switching Protocols. Bun handles the actual upgrade behind the scenes.
        return new Response(null, { status: 101 });
      }
      
      throw new HttpException({ statusCode: 500, message: "WebSocket upgrade failed" });
    };
  };

  return {
    websocket,
    createHandler
  };
};
