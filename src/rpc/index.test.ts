import { describe, expect, it, mock } from "bun:test";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { createServer } from "../app";
import {
	createRPCClient,
	createRPCFunction,
	createRPCGroup,
	createRPCPlugin,
	RPCError,
	RPCTypedError,
} from "./index";
import type { RPCContext, RPCMiddleware } from "./types";

// Dummy Standard Schema implementation
function createDummySchema<T>(failWith?: string) {
	return {
		"~standard": {
			version: 1,
			vendor: "dummy",
			validate(val: unknown) {
				if (failWith) {
					return { issues: [{ path: ["test"], message: failWith }] };
				}
				return { value: val as T };
			},
		},
	} as unknown as StandardSchemaV1<unknown, T>;
}

describe("RPC Module", () => {
	describe("RPCFunctionBuilder", () => {
		it("should create a basic function", () => {
			const fn = createRPCFunction().handler(async () => "hello");
			expect(fn._tag).toBe("RPCFunction");
			expect(fn.middlewares).toEqual([]);
		});

		it("should chain input, output, and error schemas", () => {
			const inputSchema = createDummySchema<string>();
			const outputSchema = createDummySchema<number>();
			const errorSchema = createDummySchema<{ code: string }>();

			const fn = createRPCFunction()
				.input(inputSchema)
				.output(outputSchema)
				.error(errorSchema)
				.handler(async (input, _) => {
					expect(input).toBe("test");
					return 42;
				});

			expect(fn._tag).toBe("RPCFunction");
			expect(fn.inputSchema).toBe(inputSchema);
			expect(fn.outputSchema).toBe(outputSchema);
			expect(fn.errorSchema).toBe(errorSchema);
		});

		it("should chain middlewares", () => {
			const m1 = mock(async (_: RPCContext, next) => next());
			const m2 = mock(async (_: RPCContext, next) => next());

			const fn = createRPCFunction()
				.middlewares(m1)
				.middlewares(m2)
				.handler(async () => "done");

			expect(fn.middlewares).toHaveLength(2);
			expect(fn.middlewares[0]).toBe(m1);
			expect(fn.middlewares[1]).toBe(m2);
		});
	});

	describe("RPCGroupBuilder", () => {
		it("should create a basic group", () => {
			const group = createRPCGroup().register({
				ping: createRPCFunction().handler(async () => "pong"),
			});

			expect(group._tag).toBe("RPCGroup");
			expect(group.registry.ping._tag).toBe("RPCFunction");
		});

		it("should nest groups", () => {
			const group = createRPCGroup().register({
				v1: createRPCGroup().register({
					health: createRPCFunction().handler(async () => "ok"),
				}),
			});

			expect(group.registry.v1._tag).toBe("RPCGroup");
			// @ts-ignore
			expect(group.registry.v1.registry.health._tag).toBe("RPCFunction");
		});

		it("should chain middlewares for group", () => {
			const m1 = mock(async (_: RPCContext, next) => next());
			const group = createRPCGroup()
				.middlewares(m1)
				.register({
					test: createRPCFunction().handler(async () => "ok"),
				});

			expect(group.middlewares).toHaveLength(1);
			expect(group.middlewares[0]).toBe(m1);
		});
	});

	describe("RPC Client & Plugin Integration", () => {
		it("should execute a basic function and return data", async () => {
			const app = createServer();
			const plugin = createRPCPlugin({ prefix: "/rpc" }).register({
				hello: createRPCFunction().handler(async () => "world"),
			});

			app.post("/rpc/*", plugin);

			// Create a client directly against the app for testing
			const client = createRPCClient<typeof plugin>({
				baseURL: "http://localhost",
			});

			// Mock the global fetch
			const originalFetch = globalThis.fetch;
			globalThis.fetch = async (input, init) => {
				const req = new Request(input, init);
				return app.fetch(req);
			};

			try {
				const res = await client.hello({});
				expect(res).toBe("world");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("should execute nested functions with input", async () => {
			const app = createServer();
			const plugin = createRPCPlugin({ prefix: "/api/rpc" }).register({
				users: createRPCGroup().register({
					getUser: createRPCFunction()
						.input(createDummySchema<{ id: string }>())
						.handler(async (input, _) => ({ id: input.id, name: "Alice" })),
				}),
			});

			app.post("/api/rpc/*", plugin);
			const client = createRPCClient<typeof plugin>({
				baseURL: "http://localhost",
				prefix: "/api/rpc",
				fetch: async (url, init) => app.fetch(new Request(url, init)),
			});
			const res = await client.users.getUser({ id: "123" });
			expect(res).toEqual({ id: "123", name: "Alice" });
		});

		it("should fail validation and return BAD_REQUEST", async () => {
			const app = createServer();
			const plugin = createRPCPlugin({ prefix: "/rpc" }).register({
				test: createRPCFunction()
					.input(createDummySchema<{ a: string }>("Invalid input format"))
					.handler(async () => "ok"),
			});

			app.post("/rpc/*", plugin);

			const client = createRPCClient<typeof plugin>({
				baseURL: "http://localhost",
			});

			const originalFetch = globalThis.fetch;
			globalThis.fetch = async (input, init) => {
				const req = new Request(input, init);
				return app.fetch(req);
			};

			const res = await client.test({ a: "test" });
			expect(res).toBeInstanceOf(RPCError);
			const err = res as RPCError;
			expect(err.code).toBe("VALIDATION_ERROR");
			expect(err.data).toEqual({ issues: [{ path: ["test"], message: "Invalid input format" }] });
			globalThis.fetch = originalFetch;
		});

		it("should handle custom typed errors", async () => {
			const app = createServer();
			const plugin = createRPCPlugin({ prefix: "/rpc" }).register({
				throwMe: createRPCFunction()
					.error(createDummySchema<{ code: string }>())
					.handler(async () => {
						throw new RPCTypedError({ code: "MY_ERROR" });
					}),
			});

			app.post("/rpc/*", plugin);

			const client = createRPCClient<typeof plugin>({
				baseURL: "http://localhost",
			});

			const originalFetch = globalThis.fetch;
			globalThis.fetch = async (input, init) => {
				const req = new Request(input, init);
				return app.fetch(req);
			};

			const res = await client.throwMe({});
			expect(res).toBeInstanceOf(RPCTypedError);
			const err = res as RPCTypedError<{ code: string }>;
			expect(err.data).toEqual({ code: "MY_ERROR" });
			globalThis.fetch = originalFetch;
		});

		it("should support returning errors from handler directly", async () => {
			const app = createServer();
			const plugin = createRPCPlugin({ prefix: "/rpc" }).register({
				returnMe: createRPCFunction().handler(async () => {
					return new RPCTypedError({ code: "RETURNED_ERROR" });
				}),
			});
			app.post("/rpc/*", plugin);
			const client = createRPCClient<typeof plugin>({
				baseURL: "http://localhost",
				prefix: "/rpc",
				fetch: async (url, init) => app.fetch(new Request(url, init as RequestInit)),
			});

			const res = await client.returnMe({});
			expect(res).toBeInstanceOf(RPCTypedError);
			const err = res as RPCTypedError<{ code: string }>;
			expect(err.data).toEqual({ code: "RETURNED_ERROR" });
		});

		it("should execute middlewares in correct order", async () => {
			const app = createServer();
			const calls: string[] = [];

			const m1: RPCMiddleware = async (_, next) => {
				calls.push("m1 start");
				await next();
				calls.push("m1 end");
			};
			const m2: RPCMiddleware = async (_, next) => {
				calls.push("m2 start");
				await next();
				calls.push("m2 end");
			};

			const plugin = createRPCPlugin({ prefix: "/rpc" }).register({
				group: createRPCGroup()
					.middlewares(m1)
					.register({
						fn: createRPCFunction()
							.middlewares(m2)
							.handler(async () => {
								calls.push("handler");
								return "ok";
							}),
					}),
			});

			app.post("/rpc/*", plugin);

			const client = createRPCClient<typeof plugin>({
				baseURL: "http://localhost",
			});

			const originalFetch = globalThis.fetch;
			globalThis.fetch = async (input, init) => {
				const req = new Request(input, init);
				return app.fetch(req);
			};

			try {
				await client.group.fn({});
				expect(calls).toEqual([
					"m1 start",
					"m2 start",
					"handler",
					"m2 end",
					"m1 end",
				]);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});
});
