import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { createServer } from "../../../src/app";
import { validator } from "../../../src/middlewares/validator";
import { HttpException } from "../../errors";

describe("Bun adapter integration (adapted from Elysia)", () => {
	it("handle query guard", async () => {
		const app = createServer();

		const queryValidator = validator("query", z.object({ a: z.string() }));

		app.get("/works-with", queryValidator, (c) =>
			c.text(`Works${c.valid("query").a}`),
		);
		app.get("/works-without", "Works without");

		const server = app.listen(0);

		const query = await fetch(
			`http://localhost:${server.port}/works-with?a=with`,
		).then((x) => x.text());

		expect(query).toEqual("Workswith");

		const query2 = await fetch(
			`http://localhost:${server.port}/works-without?a=1`,
		).then((x) => x.text());

		expect(query2).toEqual("Works without");

		server.stop?.();
	});

	it("handle static response with onRequest and onError", async () => {
		let caughtError: HttpException<string>;

		const app = createServer()
			.onError((error, c) => {
				caughtError = error as typeof caughtError;
				return c.text(
					"handled",
					error instanceof HttpException ? error.statusCode : 500,
				);
			})
			.onRequest((c) => {
				c.setHeaders({ "x-header": "test" });

				throw new HttpException({ statusCode: 400, data: "A" });
			});

		app.get("/", "yay");
		const server = app.listen(0);

		const response = await fetch(`http://localhost:${server.port}`);
		const text = await response.text();

		expect(text).toBe("handled");
		expect(response.status).toBe(400);
		expect(response.headers.get("x-header")).toBe("test");
		expect(caughtError!.data).toBe("A");

		server.stop?.();
	});

	it("handle non-ASCII path", async () => {
		const app = createServer();
		app.get("/สวัสดี", "สบายดีไหม");

		const server = app.listen(0);

		const response = await fetch(`http://localhost:${server.port}/สวัสดี`);
		const text = await response.text();
		expect(text).toBe("สบายดีไหม");

		server.stop?.();
	});
});
