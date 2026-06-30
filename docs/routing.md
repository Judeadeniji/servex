# Routing in ServeX

ServeX provides a high-performance routing API designed for speed and simplicity. It supports all standard HTTP methods, dynamic route parameters, and seamless schema validation.

## Creating an Application

The entry point for a ServeX application is the `createServer()` function. This initializes your main app instance and configures the underlying high-performance router.

```typescript
import { createServer } from "servex";

const app = createServer({
  basePath: "/api/v1", // Optional: Prefix all routes
  debug: true,         // Optional: Enable debug mode
});

app.get("/status", (c) => {
  return c.json({ status: "ok" });
});

export default app; // Assuming Bun execution
```

## Route Definitions

ServeX supports standard HTTP methods via intuitive router methods: `.get()`, `.post()`, `.put()`, `.delete()`, `.patch()`, `.options()`, `.head()`, and `.all()`.

You can return inline responses directly or use the Context (`c`) to formulate your response.

```typescript
// Inline response (highly optimized natively)
app.get("/health", { healthy: true });

// Context-based handler
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
