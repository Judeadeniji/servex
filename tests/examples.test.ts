import { describe, expect, test } from "bun:test";
import bodyExample from "../examples/body";
import cookie from "../examples/cookie";
import deferExample from "../examples/defer";
import errorExample from "../examples/error";
import fileExample from "../examples/file";
import headers from "../examples/headers";
import hooks from "../examples/hooks";
import html from "../examples/html";
import htmlImport from "../examples/html-import";
import params from "../examples/params";
import query from "../examples/query";
import redirect from "../examples/redirect";
import router from "../examples/router";
import simple from "../examples/simple";
import store from "../examples/store";
import stream from "../examples/stream";
import traceExample from "../examples/trace";

describe("Examples", () => {
    test("simple.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await simple.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Hi from ServeX!");
    });

    test("router.ts", async () => {
        const reqA = new Request("http://localhost/a");
        const resA = await router.fetch(reqA);
        expect(await resA.text()).toBe("A");

        const req2 = new Request("http://localhost/prefixed/2");
        const res2 = await router.fetch(req2);
        expect(await res2.text()).toBe("2");
    });

    test("params.ts", async () => {
        const req = new Request("http://localhost/id/42");
        const res = await params.fetch(req);
        expect(await res.text()).toBe("42");
    });

    test("error.ts (validation success)", async () => {
        const req = new Request("http://localhost/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "test", password: "password" })
        });
        const res = await errorExample.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ username: "test", password: "password" });
    });

    test("error.ts (validation error)", async () => {
        const req = new Request("http://localhost/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "test" })
        });
        const res = await errorExample.fetch(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe("Validation failed");
    });

    test("cookie.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await cookie.fetch(req);
        expect(res.headers.get("Set-Cookie")).toContain("name=ServeX");
        expect(await res.text()).toBe("Cookie has been set!");
    });

    test("body.ts", async () => {
        const req = new Request("http://localhost/mirror", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: "hello" })
        });
        const res = await bodyExample.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ message: "hello" });
    });

    test("stream.ts", async () => {
        const req = new Request("http://localhost/stream");
        const res = await stream.fetch(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("Transfer-Encoding")).toBe("chunked");
        const text = await res.text();
        expect(text).toContain("First chunk");
        expect(text).toContain("Second chunk");
    });

    test("headers.ts", async () => {
        const req = new Request("http://localhost/", { headers: { "user-agent": "BunTest" } });
        const res = await headers.fetch(req);
        expect(res.headers.get("X-Powered-By")).toBe("ServeX");
        expect(res.headers.get("X-Custom")).toBe("Value");
        expect(await res.text()).toContain("BunTest");
    });

    test("redirect.ts", async () => {
        const req = new Request("http://localhost/old");
        const res = await redirect.fetch(req);
        expect(res.status).toBe(301);
        expect(res.headers.get("Location")).toBe("/new");
    });

    test("store.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await store.fetch(req);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.message).toBe("Store example");
        expect(typeof json.requestId).toBe("string");
        expect(typeof json.processingTimeMs).toBe("number");
    });

    test("html.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await html.fetch(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("text/html; charset=UTF-8");
        expect(await res.text()).toContain("<h1>Hello from ServeX HTML 👋</h1>");
    });

    test("query.ts", async () => {
        const req = new Request("http://localhost/search?q=test&tag=a&tag=b");
        const res = await query.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ searchFor: "test", filters: ["a", "b"] });
    });

    test("defer.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await deferExample.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("Response sent immediately");
    });

    test("hooks.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await hooks.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Hooks demo");
    });

    test("trace.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await traceExample.fetch(req);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("Trace API demo");
    });

    test("file.ts", async () => {
        const req = new Request("http://localhost/file.ts");
        const res = await fileExample.fetch(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
        expect(await res.text()).toContain('serveStatic({ root: "./examples" })');
    });

    test("html-import.ts", async () => {
        const req = new Request("http://localhost/");
        const res = await htmlImport.fetch(req);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("text/html; charset=UTF-8");
        expect(await res.text()).toContain("<h1>Imported HTML!</h1>");
    });
});
