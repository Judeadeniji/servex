import { Elysia } from "elysia";
import { Hono } from "hono";
import { bench, group, run } from "mitata";
import { createServer } from "../../src/index";

const servexApp = createServer();
servexApp.get("/", (c) => c.text("Hello World"));

const honoApp = new Hono();
honoApp.get("/", (c) => c.text("Hello World"));

const elysiaApp = new Elysia();
elysiaApp.get("/", () => "Hello World");

// Pre-compile Elysia router
elysiaApp.fetch(new Request("http://localhost/"));
servexApp.fetch(new Request("http://localhost/"));
honoApp.fetch(new Request("http://localhost/"));

const req = new Request("http://localhost/");

group("Synthetic benchmark (fetch)", () => {
	bench("ServeX", async () => {
		await servexApp.fetch(req);
	});
	bench("Hono", async () => {
		await honoApp.fetch(req);
	});
	bench("Elysia", async () => {
		await elysiaApp.fetch(req);
	});
});

await run();
