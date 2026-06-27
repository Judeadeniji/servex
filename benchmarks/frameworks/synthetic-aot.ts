import { Elysia } from "elysia";
import { Hono } from "hono";
import { bench, group, run } from "mitata";
import { createServer } from "../../src/index";

// ServeX (AOT Precompiled)
const servexAOTApp = createServer();
servexAOTApp.get("/", (c) => c.text("Hello World"));
servexAOTApp.compile();

const honoApp = new Hono();
honoApp.get("/", (c) => c.text("Hello World"));

const elysiaApp = new Elysia();
elysiaApp.get("/", () => "Hello World");

// Warmup
elysiaApp.fetch(new Request("http://localhost/"));
servexAOTApp.fetch(new Request("http://localhost/"));
honoApp.fetch(new Request("http://localhost/"));

const req = new Request("http://localhost/");

group("Synthetic benchmark (fetch)", () => {
	bench("ServeX (AOT compile)", async () => {
		await servexAOTApp.fetch(req);
	});
	bench("Hono", async () => {
		await honoApp.fetch(req);
	});
	bench("Elysia", async () => {
		await elysiaApp.fetch(req);
	});
});

await run();
