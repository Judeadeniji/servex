import { describe, expect, it } from "bun:test";
import { createServer } from "../src/index";

describe("Context State (set/get)", () => {
	it("should store and retrieve untyped state", async () => {
		const app = createServer();

		app.use("*", (c, next) => {
			c.set("untypedKey", "hello");
			return next();
		});

		app.get("/", (c) => {
			const val = c.get("untypedKey");
			return c.text(val as string);
		});

		const res = await app.fetch(new Request("http://localhost/"));
		expect(await res.text()).toBe("hello");
	});

	it("should store and retrieve strongly typed state via Env generic", async () => {
		type AppEnv = {
			Variables: {
				userId: number;
				isAdmin: boolean;
			};
		};

		// To test typing, we mock the Context typing by explicitly casting the handler context,
		// or by creating a helper since app is typically typed by the user or chaining.
		const app = createServer<AppEnv>();

		app.use("*", (c, next) => {
			c.set("userId", 123);
			c.set("isAdmin", true);
			return next();
		});

		app.get("/profile", (c) => {
			const id = c.get("userId"); // Should infer as number
			const admin = c.get("isAdmin"); // Should infer as boolean

			return c.json({ id, admin });
		});

		const res = await app.fetch(new Request("http://localhost/profile"));
		expect(await res.json()).toEqual({ id: 123, admin: true });
	});
});
