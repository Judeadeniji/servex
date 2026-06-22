import { describe, expect, it } from "bun:test";
import { createServer } from "../../../src";
import { basicAuth } from "./index";

describe("Middleware: Basic Auth", () => {
	const USERNAME = "admin";
	const PASSWORD = "password123";
	const validHeader = `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`;
	const invalidHeader = `Basic ${btoa(`admin:wrongpassword`)}`;

	it("should allow request with correct credentials", async () => {
		const app = createServer();
		app.use(basicAuth({ username: USERNAME, password: PASSWORD }));
		app.get("/", (c) => c.text("Authorized"));

		const res = await app.fetch(
			new Request("http://localhost/", {
				headers: { Authorization: validHeader },
			}),
		);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("Authorized");
	});

	it("should block request without Authorization header", async () => {
		const app = createServer();
		app.use(basicAuth({ username: USERNAME, password: PASSWORD }));
		app.get("/", (c) => c.text("Authorized"));

		const res = await app.fetch(new Request("http://localhost/"));

		expect(res.status).toBe(401);
		expect(res.headers.get("WWW-Authenticate")).toBe(
			'Basic realm="Secure Area"',
		);
		expect(await res.text()).toBe("Unauthorized");
	});

	it("should block request with incorrect credentials", async () => {
		const app = createServer();
		app.use(basicAuth({ username: USERNAME, password: PASSWORD }));
		app.get("/", (c) => c.text("Authorized"));

		const res = await app.fetch(
			new Request("http://localhost/", {
				headers: { Authorization: invalidHeader },
			}),
		);

		expect(res.status).toBe(401);
		expect(res.headers.get("WWW-Authenticate")).toBe(
			'Basic realm="Secure Area"',
		);
		expect(await res.text()).toBe("Unauthorized");
	});

	it("should allow request using custom verifyUser function", async () => {
		const app = createServer();
		app.use(
			basicAuth({
				verifyUser: async (_c, { username, password }) =>
					username === "super" && password === "secret",
			}),
		);
		app.get("/", (c) => c.text("Authorized"));

		const superHeader = `Basic ${btoa("super:secret")}`;
		const res = await app.fetch(
			new Request("http://localhost/", {
				headers: { Authorization: superHeader },
			}),
		);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("Authorized");
	});

	it("should support custom realm", async () => {
		const app = createServer();
		app.use(
			basicAuth({
				username: USERNAME,
				password: PASSWORD,
				realm: "Admin Panel",
			}),
		);
		app.get("/", (c) => c.text("Authorized"));

		const res = await app.fetch(new Request("http://localhost/"));

		expect(res.status).toBe(401);
		expect(res.headers.get("WWW-Authenticate")).toBe(
			'Basic realm="Admin Panel"',
		);
	});

	it("should execute custom onFail function", async () => {
		const app = createServer();
		app.use(
			basicAuth({
				username: USERNAME,
				password: PASSWORD,
				onFail: (c) => c.json({ error: "Access Denied" }, 403),
			}),
		);
		app.get("/", (c) => c.text("Authorized"));

		const res = await app.fetch(new Request("http://localhost/"));

		expect(res.status).toBe(403);
		// Header should still be set by the middleware before calling onFail
		expect(res.headers.get("WWW-Authenticate")).toBe(
			'Basic realm="Secure Area"',
		);
		expect(await res.json()).toEqual({ error: "Access Denied" });
	});

	it("should block malformed Authorization headers", async () => {
		const app = createServer();
		app.use(basicAuth({ username: USERNAME, password: PASSWORD }));
		app.get("/", (c) => c.text("Authorized"));

		const res = await app.fetch(
			new Request("http://localhost/", {
				headers: { Authorization: "Basic not-base64" },
			}),
		);

		expect(res.status).toBe(401);
		expect(await res.text()).toBe("Unauthorized");
	});
});
