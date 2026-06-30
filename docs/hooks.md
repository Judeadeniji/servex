# Hooks & Lifecycle

ServeX provides two layers of lifecycle hooks: **Global Application Hooks** for request/response interception, and a **Trace API** for deep performance monitoring.

## Global Application Hooks

ServeX exposes a robust set of hooks that let you tap into different phases of the request lifecycle. These are registered directly on your `app` instance.

- **`onRequest(ctx)`**: Runs immediately when a request is received, before any routing or middleware execution.
- **`onBeforeHandle(ctx)`**: Runs after routing matches, but before the main route handler executes.
- **`onAfterHandle(ctx, response)`**: Runs after the route handler has executed and produced a response. You can intercept, modify, or completely replace the outgoing `Response`.
- **`onError(error, ctx)`**: Catches and handles any unhandled errors or `HttpException`s thrown during the request lifecycle.
- **`onResponse(ctx)`**: The final hook, running right before the response is sent back to the client (read-only phase).

### Post Response Hooks

Use the `onAfterHandle` hook to modify responses globally after the handler has finished, but before the response is finalized.

```typescript
app.onAfterHandle((c, response) => {
  // Add global CORS headers or custom metrics
  response.headers.set("X-Powered-By", "ServeX");
  
  // You can modify the response or return an entirely new one!
  return response;
});

app.onResponse((c) => {
  // Runs right as the response is flushed to the network.
  // Useful for cleanup or logging, but you cannot modify the response here.
  console.log(`Flushed response for ${c.req.url}`);
});
```

### Global Error Hook

You can intercept all unhandled exceptions (including `HttpException`s) by defining a global `onError` hook. This is the ideal place to format your API's standard error response structure.

```typescript
import { HttpException } from "servex/http-exception";

app.onError((err, c) => {
  console.error("Global Error Caught:", err);

  if (err instanceof HttpException) {
    // Gracefully format expected HTTP errors
    return c.json({ ok: false, message: err.message }, err.status);
  }

  // Handle completely unexpected crashes
  return c.json({ ok: false, message: "Internal Server Error" }, 500);
});
```

## Trace API (Performance Monitoring)

For advanced performance monitoring, ServeX exposes a low-level Trace API. This allows you to hook directly into the router's execution phases to measure execution time.

```typescript
app.trace((api) => {
  api.onRequest(async () => {
    const start = performance.now();
    
    // You can tap into different phases here to measure duration
    
    console.log(`Request started at ${start}`);
  });
});
```
