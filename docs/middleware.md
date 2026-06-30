# ServeX Middlewares & Context

This guide explains how to use ServeX's powerful middleware system and Context object. Middlewares allow you to intercept, modify, and act upon requests and responses, while the Context object provides a performant interface for interacting with them.

## The Context Object

The `Context` (often abbreviated as `c`) is the central object passed to every route handler, middleware, and lifecycle hook in ServeX. It provides everything you need to handle a request, access parameters, read variables, and send a response.

### Key Context Methods

- **Request Parsing**:
  - `c.req.json()`: Parses the request body as JSON.
  - `c.params("key")`: Retrieves matched route parameters.
  - `c.query("key")`: Retrieves URL query parameters.
  - `c.formData()`, `c.urlEncoded()`: Parse form submissions.

- **Variables & Environment**:
  - `c.set("key", value)` / `c.get("key")`: Share data between middlewares and handlers.
  - `c.env`: Access environment variables and bindings (like Cloudflare Workers KV or D1).

- **Sending Responses**:
  - `c.json({ message: "Hello" })`: Sends a JSON response.
  - `c.text("Hello")`: Sends plain text.
  - `c.html("<h1>Hello</h1>")`: Sends HTML.
  - `c.redirect("/login")`: Redirects the client.
  - `c.error(404, "Not Found")`: Throws an HTTP exception.

- **Background Tasks**:
  - `c.defer(() => { ... })`: Defers execution of a task until *after* the response has been sent to the client. Perfect for logging or analytics.

## Error Handling

ServeX provides structured error handling through the `HttpException` class and the `onError` global hook.

### Throwing HTTP Exceptions

If you need to instantly break the execution flow and return an error (e.g., in a middleware or deeply nested function), use `HttpException`:

```typescript
import { HttpException } from "servex";

app.get("/restricted", (c) => {
  throw new HttpException(403, "You do not have access to this resource.");
});
```

## Custom Middlewares

Middlewares are functions that receive the `Context` and a `next` function. They allow you to run code before and after the downstream handlers. ServeX middlewares are fully asynchronous and use the standard `await next()` pattern.

### Writing a Custom Middleware

Here is an example of writing a custom authentication middleware:

```typescript
import type { Context, NextFunction } from "servex";

export const requireAuth = async (c: Context, next: NextFunction) => {
  const token = c.req.headers.get("Authorization");

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Set data in context to be used by the handler
  c.set("user", "user-id-from-token");

  // Call next() to proceed to the next middleware or route handler
  await next();
}
```

### Deferring Execution

You can use the `c.defer()` method within a middleware to run code *after* the client has received the response. This is highly optimized and avoids blocking the response loop.

```typescript
export const myLogger = async (c: Context, next: NextFunction) => {
  const start = performance.now();
  
  await next();
  
  c.defer(() => {
    const duration = performance.now() - start;
    console.log(`Request to ${c.req.url} took ${duration}ms`);
  });
};
```

### Chaining and Composition

ServeX makes it trivial to compose multiple middlewares. Instead of deeply nesting `app.use` calls, you can compose them by passing multiple middleware functions into a single method call. They will execute sequentially in the order they are provided.

**Global Composition:**

```typescript
// Compose globally via multiple arguments
app.use(myLogger, rateLimiter, requireAuth);

// Or via an array spread
const standardStack = [myLogger, rateLimiter];
app.use(...standardStack, requireAuth);
```

**Route-Specific Composition:**

Middlewares can be composed directly onto specific routes. This ensures they only trigger when the route is matched.

```typescript
app.get(
  "/dashboard", 
  requireAuth,           // Middleware 1
  checkPermissions,      // Middleware 2
  (c) => {               // Final Handler
    const user = c.get("user");
    return c.json({ message: `Welcome ${user}` });
  }
);
```
