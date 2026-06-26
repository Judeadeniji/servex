import { describe, expect, test } from "bun:test";
import { BadRequestError, InternalServerError, NotFoundError } from "./errors";
import { HttpException } from "./http-exception";
import { createServer } from "./index";
import { RPCError, RPCTypedError } from "./rpc/error";

describe("Error Handling System", () => {
	describe("HttpException Base Class", () => {
		test("creates correctly with basic options", () => {
			const err = new HttpException({ statusCode: 400 });
			expect(err.statusCode).toBe(400);
			expect(err.error).toBe("Bad Request");
			expect(err.message).toBe("Bad Request");
			expect(err.data).toBeUndefined();
		});

		test("creates with custom options and generic data", () => {
			const err = new HttpException<{ field: string }>({
				statusCode: 422,
				message: "Invalid field",
				error: "VALIDATION_ERROR",
				data: { field: "username" },
			});
			expect(err.statusCode).toBe(422);
			expect(err.message).toBe("Invalid field");
			expect(err.error).toBe("VALIDATION_ERROR");
			expect(err.data).toEqual({ field: "username" });
		});

		test("getResponse() serializes to structured JSON", async () => {
			const err = new HttpException({
				statusCode: 400,
				message: "My custom error",
				data: { foo: "bar" },
			});
			const res = err.getResponse();
			expect(res.status).toBe(400);
			expect(res.headers.get("Content-Type")).toBe(
				"application/json; charset=UTF-8",
			);

			const json = await res.json();
			expect(json).toEqual({
				statusCode: 400,
				error: "Bad Request",
				message: "My custom error",
				data: { foo: "bar" },
			});
		});
	});

	describe("ctx.error() helper", () => {
		test("creates HttpException directly and returns Response", async () => {
			const app = createServer();
			app.get("/", (ctx) => {
				return ctx.error(
					418,
					"I'm a teapot",
					{ tea: "green" },
					"TEAPOT_ERROR",
				);
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(418);
			expect(await res.json()).toEqual({
				statusCode: 418,
				message: "I'm a teapot",
				data: { tea: "green" },
				error: "TEAPOT_ERROR",
			});
		});

		test("wraps standard Error instances", async () => {
			const app = createServer();
			app.get("/", (ctx) => {
				const standardError = new Error("Something broke");
				return ctx.error(standardError);
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(500);
			const json = await res.json();
			expect(json.statusCode).toBe(500);
			expect(json.message).toBe("Something broke");
			expect(json.error).toBe("Internal Server Error");
		});

		test("passes through HttpException instances unmodified", async () => {
			const app = createServer();
			app.get("/", (ctx) => {
				const httpErr = new BadRequestError("Already formatted");
				return ctx.error(httpErr);
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				statusCode: 400,
				message: "Already formatted",
				error: "Bad Request",
			});
		});
	});

	describe("First-Class Errors in Handlers", () => {
		test("automatically catches returned generic Error", async () => {
			const app = createServer();
			app.get("/", () => {
				return new Error("Oops returned");
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(500);
			expect((await res.json()).message).toBe("An unexpected error occurred");
		});

		test("automatically catches thrown generic Error", async () => {
			const app = createServer();
			app.get("/", () => {
				throw new Error("Oops thrown");
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(500);
			expect((await res.json()).message).toBe("An unexpected error occurred");
		});

		test("automatically catches returned Named HttpException", async () => {
			const app = createServer();
			app.get("/", () => {
				return new NotFoundError("Where is it?");
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(404);
			expect((await res.json()).message).toBe("Where is it?");
		});

		test("automatically catches returned RPCError as HttpException", async () => {
			const app = createServer();
			app.get("/", () => {
				return new RPCError("UNAUTHORIZED", "Go away", { ip: "1.1.1.1" });
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({
				statusCode: 401,
				error: "UNAUTHORIZED",
				message: "Go away",
				data: { ip: "1.1.1.1" },
			});
		});

		test("automatically catches returned RPCTypedError as HttpException", async () => {
			const app = createServer();
			app.get("/", () => {
				return new RPCTypedError({ custom: "data" });
			});

			const res = await app.fetch(new Request("http://localhost/"));
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({
				statusCode: 500,
				error: "TYPED_ERROR",
				message: "Typed RPC error",
				data: { custom: "data" },
			});
		});
	});

	describe("Named Errors", () => {
		test("BadRequestError configuration", () => {
			const err = new BadRequestError();
			expect(err.statusCode).toBe(400);
			expect(err.name).toBe("BadRequestError");
		});

		test("NotFoundError configuration", () => {
			const err = new NotFoundError();
			expect(err.statusCode).toBe(404);
			expect(err.name).toBe("NotFoundError");
		});

		test("InternalServerError configuration", () => {
			const err = new InternalServerError();
			expect(err.statusCode).toBe(500);
			expect(err.name).toBe("InternalServerError");
		});
	});
});
