# Adapters & Deployment

ServeX abstracts the underlying HTTP server, allowing you to run the exact same codebase on Bun, Cloudflare Workers, Node.js (via Web Standard APIs), or any platform that supports the native `fetch` standard.

## Choosing an Adapter

When creating your server, you can explicitly provide an adapter. If omitted, ServeX defaults to the `WebStandardAdapter` to ensure maximum compatibility out-of-the-box.

```typescript
import { createServer } from "servex";
import { CloudflareAdapter, BunAdapter, WebStandardAdapter } from "servex/adapter";

const app = createServer({
  // Pick the target runtime
  adapter: BunAdapter
});
```

## Running on Bun / Node (Stand-alone)

For traditional server environments where the process stays alive and manages its own sockets, use `app.listen()`.

```typescript
// Uses Bun or Node native HTTP bindings under the hood
const server = app.listen(3000, (s) => {
  console.log(`Server listening at http://${s.hostname}:${s.port}`);
});

// Shutting down
// server.stop();
```

## Running on Cloudflare Workers / Vercel Edge

Serverless environments don't "listen" on a port. Instead, they expect you to export an object containing a `fetch` handler. ServeX exposes `app.fetch` which exactly matches the standard Fetch API signature.

```typescript
// src/index.ts
import { createServer } from "servex";
import { CloudflareAdapter } from "servex/adapter";

const app = createServer({ adapter: CloudflareAdapter });

app.get("/", (c) => c.text("Hello from the Edge!"));

// Export the fetch handler for the worker runtime
export default {
  fetch: app.fetch
};
```

## Custom Adapters

Because ServeX only relies on standard Web APIs (`Request`, `Response`, `URL`), you can build custom adapters for highly specialized environments (like AWS Lambda or service workers) by implementing the `ServeXAdapter` interface, which tells the framework how to serve static files and bind to ports natively.
