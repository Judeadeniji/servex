# Routing in ServeX

ServeX provides a high-performance routing API designed for speed and simplicity. It supports all standard HTTP methods, dynamic route parameters, and seamless schema validation.

## Creating an Application & Configuration

The entry point for a ServeX application is the `createServer()` function. You can pass a `ServerOptions` configuration object to customize the router's behavior, compilation strategies, and base paths.

```typescript
import { createServer } from "servex";

const app = createServer({
  basePath: "/api/v1", // Optional: Prefix all routes registered on this app
  debug: true,         // Optional: Enable debug mode for verbose logging
  aot: true,           // Optional: Enable Ahead-of-Time compilation for routes
  jit: true,           // Optional: Enable Just-in-Time optimizations
  nativeStaticResponse: true, // Optional: Bypass the router entirely for static literal responses
  adapter: "bun"       // Optional: Explicitly define the runtime adapter ("bun", "web-standard", etc.)
});
```

## Route Definitions

ServeX supports standard HTTP methods via intuitive router methods: `.get()`, `.post()`, `.put()`, `.delete()`, `.patch()`, `.options()`, `.head()`, and `.all()`.

### Static Handlers

ServeX is heavily optimized for returning static data. If a route always returns the exact same string, JSON object, or number, you can pass it directly as the handler. When combined with the `nativeStaticResponse: true` configuration, ServeX can bypass execution overhead completely.

```typescript
// Inline response (highly optimized natively)
app.get("/health", { healthy: true });

// Plain string literal
app.get("/version", "v1.0.0");
```

### Dynamic Handlers

For dynamic data, use a standard function that takes the Context (`c`) to formulate your response.

```typescript
app.post("/users", async (c) => {
  const body = await c.req.json();
  // Process the user...
  return c.json({ message: "User created!" }, 201);
});

// Catch-all method
app.all("/ping", "pong");
```

## Route Parameters

Dynamic route segments allow you to capture values directly from the URL path. ServeX provides strict type inference for your route parameters.

### Named Parameters

Prefix a segment with `:` to create a named parameter. You can access it using `c.params()`.

```typescript
app.get("/users/:id", (c) => {
  // `userId` is strictly typed as a string
  const userId = c.params("id"); 
  return c.text(`Fetching user ${userId}`);
});
```

### Wildcards

You can use wildcards (`*`) for catch-all routes. Wildcards can also be named for easy extraction.

```typescript
app.get("/files/*path", (c) => {
  const filePath = c.params("path");
  return c.text(`Serving file from ${filePath}`);
});
```

## Standard Schema Validation

Data validation in ServeX is completely agnostic, powered by [Standard Schema](https://github.com/standard-schema/standard-schema). This means you can use your favorite validation library—like **Zod**, **Valibot**, or **ArkType**—without needing a library-specific middleware adapter.

To use validation, import the `validator` middleware. It supports validating the `"body"`, `"query"`, or `"params"`. The validated and strictly typed data can then be retrieved via `c.valid(target)`.

### Example: Validating a POST Body with Zod

```typescript
import { createServer, validator } from "servex";
import { z } from "zod";

const app = createServer();

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

app.post(
  "/users",
  validator("body", userSchema),
  (c) => {
    // The data is automatically typed according to your schema
    const data = c.valid("body");
    
    return c.json({
      message: "User created successfully",
      user: data,
    }, 201);
  }
);
```

### Example: Validating Query Parameters

```typescript
const querySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().default(10),
});

app.get(
  "/search",
  validator("query", querySchema),
  (c) => {
    const { search, limit } = c.valid("query");
    return c.json({ results: [], search, limit });
  }
);
```

If validation fails, the `validator` middleware automatically rejects the request with a `400 Bad Request` and a JSON response detailing the schema issues. This guarantees your handlers only execute when the incoming data is fully sound.

## Sub-Routing & Routing Patterns

As your application grows, defining all routes on a single `app` instance becomes unmanageable. ServeX provides powerful routing patterns to help you compose nested applications via the `app.route()` method.

### Nesting via Callbacks

You can mount a group of routes under a specific prefix using a callback. ServeX will automatically create a child router and prefix all definitions inside it.

```typescript
app.route("/api", (api) => {
  // Matches: GET /api/users
  api.get("/users", (c) => c.json([]));
  
  // Matches: POST /api/users
  api.post("/users", (c) => c.json({ created: true }));

  // You can nest infinitely!
  api.route("/v1", (v1) => {
    // Matches: GET /api/v1/status
    v1.get("/status", "OK");
  });
});
```

### Nesting via Separate Instances

For massive codebases, you can create entirely separate router instances in different files and merge them into the main app. This pattern is perfect for building modular plugins and domain-driven architectures.

```typescript
// users.ts
import { createServer } from "servex";

// You just create a standard ServeX instance to act as a sub-router
const usersApp = createServer();

usersApp.get("/", (c) => c.json([{ id: 1 }]));
usersApp.post("/", (c) => c.json({ created: true }));

export default usersApp;
```

```typescript
// main.ts
import { createServer } from "servex";
import usersApp from "./users";

const app = createServer();

// Mounts the usersApp router at the /users prefix
app.route("/users", usersApp);
```
