import { createServer } from "../../src/index";
import { Hono } from "hono";
import { Elysia } from "elysia";

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

async function bench(name: string, fetchFn: (req: Request) => Promise<Response> | Response, iters: number) {
  const req = new Request("http://localhost/");
  
  // Warmup
  for (let i = 0; i < 10000; i++) {
    await fetchFn(req);
  }

  // Proper test
  const start = performance.now();
  for (let i = 0; i < iters; i++) {
    await fetchFn(req);
  }
  const end = performance.now();
  
  const ms = end - start;
  const ops = Math.floor((iters / ms) * 1000);
  console.log(`${name}: ${ops.toLocaleString()} req/s (${ms.toFixed(2)} ms)`);
}

async function run() {
  const ITERATIONS = 2_000_000;
  console.log(`Running synthetic benchmark (${ITERATIONS.toLocaleString()} iterations)...`);
  
  await bench("ServeX", (req) => servexApp.fetch(req), ITERATIONS);
  await bench("Hono", (req) => honoApp.fetch(req), ITERATIONS);
  await bench("Elysia", (req) => elysiaApp.fetch(req), ITERATIONS);
}

run();
