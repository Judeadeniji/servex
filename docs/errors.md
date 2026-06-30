# Error Handling in ServeX

ServeX treats error handling as a first-class feature. It provides an extremely robust, heavily optimized set of primitives to manage HTTP errors so that your API always returns predictable, structured JSON responses without manual `try/catch` boilerplate.

## The `HttpException`

The core of ServeX's error handling is the `HttpException` class. It extends the native JavaScript `Error` but attaches HTTP-specific metadata (status code, structured data, headers).

Whenever an `HttpException` is thrown—anywhere in your handlers, middlewares, or background tasks—ServeX automatically catches it and converts it into a standard JSON `Response`.

```typescript
import { HttpException } from "servex";

app.get("/secret", (c) => {
  throw new HttpException({
    statusCode: 401,
    message: "Missing access token",
    data: { missingField: "Authorization" } // Optional custom payload
  });
});
```

**Automatic Output:**
```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Missing access token",
  "data": { "missingField": "Authorization" }
}
```

## The Context Shorthand

For simple errors, you don't even need to instantiate the class manually. The `Context` object provides a `c.error()` helper that creates the `HttpException` for you.

```typescript
app.get("/file", (c) => {
  throw c.error(404, "File not found");
});
```

## Semantic Error Classes

To avoid memorizing HTTP status codes, the `servex/errors` module exports pre-configured semantic classes for almost every standard HTTP error. They automatically inject the correct status code and default messages.

```typescript
import { 
  BadRequestError, 
  UnauthorizedError, 
  ForbiddenError, 
  NotFoundError, 
  MethodNotAllowedError, 
  ConflictError, 
  TooManyRequestsError, 
  InternalServerError 
} from "servex/errors";

app.post("/users", async (c) => {
  const user = await c.req.json();
  
  if (!user.email) {
    // 400 Bad Request
    throw new BadRequestError("Email is required");
  }

  if (await db.exists(user.email)) {
    // 409 Conflict
    throw new ConflictError("Email already in use");
  }

  return c.json({ success: true });
});
```

### Specialized Semantic Errors

Some classes offer helpful constructor arguments specific to the HTTP spec:

- `new MethodNotAllowedError(["GET", "POST"])` automatically sets the `"Allow"` header for you.
- `new TooManyRequestsError(60, "Rate limited")` automatically sets the `"Retry-After": "60"` header for you.

## Global Error Interception

By default, ServeX turns all `HttpException`s into JSON. But what if you want to log these errors, or catch native runtime errors (e.g., `TypeError`, `ReferenceError`) so they don't crash the server or leak stack traces to the client?

You can define an `onError` hook on your application instance.

```typescript
import { isHttpException } from "servex/errors";

app.onError((err, c) => {
  // 1. Log the crash to an external service (Sentry, Datadog, etc.)
  console.error("[CRASH]:", err);

  // 2. If it's an expected HTTP error, you can let it resolve normally
  // by calling err.getResponse(), or format it to match your own custom spec.
  if (isHttpException(err)) {
    return c.json({
      success: false,
      code: err.statusCode,
      reason: err.message
    }, err.statusCode);
  }

  // 3. For completely unexpected runtime crashes, return a generic 500
  // so you don't leak database queries or file paths to users.
  return c.json({
    success: false,
    code: 500,
    reason: "Internal Server Error"
  }, 500);
});
```
