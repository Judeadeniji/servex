import { describe, it, expect } from "bun:test";
import { createServer } from "../src/index";

describe("Native Static Response Injection", () => {
	it("should convert inline values to route handlers", async () => {
		const app = createServer();
		
		app.get("/string", "hello");
		app.get("/number", 42);
		app.get("/boolean", true);
		app.get("/object", { message: "ok" });
		app.get("/response", new Response("custom"));

		const resString = await app.request("http://localhost/string");
		expect(await resString.text()).toBe("hello");

		const resNum = await app.request("http://localhost/number");
		expect(await resNum.text()).toBe("42");

		const resBool = await app.request("http://localhost/boolean");
		expect(await resBool.text()).toBe("true");

		const resObj = await app.request("http://localhost/object");
		expect(await resObj.json()).toEqual({ message: "ok" });

		const resResp = await app.request("http://localhost/response");
		expect(await resResp.text()).toBe("custom");
	});

	it("should inject static routes into app.static if nativeStaticResponse is true", () => {
		const app = createServer({ nativeStaticResponse: true });
		
		app.get("/version", "1.0.0");
		app.get("/api/status", { status: "ok" });
		
		// Shouldn't inject if it has path params or wildcard
		app.get("/user/:id", "123");
		app.get("/static/*", "fallback");

		// Shouldn't inject if it has middlewares
		app.get("/middleware", () => {}, "hello");

		expect(app.static).toBeDefined();
		expect(app.static?.["/version"]).toBeDefined();
		expect(app.static?.["/api/status"]).toBeDefined();

		expect(app.static?.["/user/:id"]).toBeUndefined();
		expect(app.static?.["/static/*"]).toBeUndefined();
		expect(app.static?.["/middleware"]).toBeUndefined();
	});

	it("should return the correct content type in static response", async () => {
		const app = createServer({ nativeStaticResponse: true });
		app.get("/version", "1.0.0");
		app.get("/api/status", { status: "ok" });
		
		const resStr = app.static?.["/version"] as Response;
		expect(await resStr.clone().text()).toBe("1.0.0");
		expect(resStr.headers.get("Content-Type")).toBe("text/plain; charset=UTF-8");

		const resObj = app.static?.["/api/status"] as Response;
		expect(await resObj.clone().json()).toEqual({ status: "ok" });
		expect(resObj.headers.get("Content-Type")).toBe("application/json; charset=UTF-8");
	});
});
