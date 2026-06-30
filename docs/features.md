# ServeX Features

This guide covers additional built-in features, APIs, and middlewares provided by ServeX.

## Plugins

ServeX allows you to modularize your application by writing reusable plugins. A plugin is simply an object that implements the `ServeXPlugin` interface, exposing a `setup` method.

### Writing a Plugin

```typescript
import type { ServeXPlugin } from "servex";

export const myPlugin: ServeXPlugin = {
  name: "my-user-plugin",
  setup(app, prefix) {
    // You can mount routes directly onto the application instance
    app.get(`${prefix}/profile`, (c) => c.json({ user: "Alice" }));
    
    // You can also register plugin-specific middlewares
    app.use(async (c, next) => {
       console.log(`[Plugin] Request to: ${c.req.url}`);
       await next();
    });

    return app;
  }
};
```

### Using a Plugin

You can register plugins globally or mount them under a specific prefix using `app.use()`.

```typescript
import { createServer } from "servex";
import { myPlugin } from "./my-plugin";

const app = createServer();

// Mounts the plugin logic to the /api prefix
// The plugin's routes will now be available at /api/profile
app.use("/api", myPlugin);
```

## CORS Middleware

ServeX ships with a highly optimized CORS middleware.

```typescript
import { createServer } from "servex";
import { cors } from "servex/middlewares/cors";

const app = createServer();

app.use(cors({
  origin: "https://my-frontend.com", // Can be a string, array, or function
  allowMethods: ["GET", "POST", "OPTIONS"],
  credentials: true
}));
```

## Cookies

The `Context` provides native methods to seamlessly set cookies on your outgoing response.

```typescript
app.post("/login", (c) => {
  // Set a single cookie
  c.setCookie("session_id", "12345", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 3600
  });

  // Set multiple cookies at once
  c.setCookies(
    { theme: "dark", lang: "en" },
    { maxAge: 86400 }
  );

  return c.text("Logged in!");
});
```

To parse cookies, you can import the high-performance parser from `servex/cookie`.

## HTML Rendering

ServeX includes a dedicated `c.html()` method for returning HTML responses. It natively supports `HTMLBundlelike` objects and automatically sets the correct `Content-Type: text/html; charset=UTF-8` headers.

```typescript
app.get("/home", (c) => {
  return c.html("<h1>Welcome to ServeX!</h1>");
});
```

## Signals & Routines (Hierarchical Context)

ServeX implements a highly advanced **Hierarchical Context architecture** via `c.routine()`. If you are familiar with Go's `context` package, this will feel right at home. If you are not, think of routines as an invisible "tree" that manages the lifecycle, timeouts, and scoped variables of your background tasks.

Instead of passing variables and cancellation tokens manually through every deeply nested function call, you create a routine tree. The strict rules of this tree are:

1. **Cancellation flows DOWN:** If you cancel a parent routine (or if the user drops the HTTP connection), the parent automatically signals and cancels every single child routine nested beneath it. This entirely prevents orphaned background tasks, runaway database queries, and memory leaks.
2. **Values flow UP:** If a child routine needs a value (like a `traceId`), it will walk up the tree until it finds an ancestor that has it. Ancestors cannot see values injected into their children, allowing you to safely scope data to specific branches of execution.

Every HTTP request automatically creates a root routine tied to the browser's `AbortSignal`. You can branch off this root routine using helpers from `servex/core/signal`.

### 1. `withCancel`: Manual Branch Cancellation

You can spawn a sub-routine that can be manually aborted without affecting the parent request.

```typescript
import { withCancel } from "servex/core/signal";

app.get("/task", async (c) => {
  // Branch off the main request routine
  const [childCtx, cancel] = withCancel(c.routine());

  // Pass childCtx.signal to an external process
  fetch("https://api.example.com/long-polling", { signal: childCtx.signal }).catch(() => {});

  // Manually cancel the child routine after some condition is met
  // This does NOT cancel the parent request (c.routine())
  if (someCondition) {
    cancel(); 
  }

  return c.text("Done");
});
```

### 2. `withTimeout`: Managing Deadlines

You can use the Go-style context tree to spawn sub-routines that automatically clean up when a deadline passes or the request drops—whichever happens first.

```typescript
import { withTimeout } from "servex/core/signal";

app.get("/stream", async (c) => {
  // Create a child routine that times out after 5 seconds
  // If the user drops connection before 5s, the child is STILL aborted because cancellation flows DOWN!
  const [childCtx, cancel] = withTimeout(c.routine(), 5000);

  const timer = setInterval(() => {
    console.log("Processing heavy background task...");
  }, 1000);

  childCtx.signal.addEventListener("abort", () => {
    console.log("Routine aborted! Cleaning up interval...");
    clearInterval(timer);
  });

  return c.text("Processing started in the background.");
});
```

### 3. `withValue`: Hierarchical State

While `c.set()` is great for flat request state, `withValue` lets you scope state to a specific branch of execution. Because values flow UP, a child can always read an ancestor's value, but an ancestor cannot read a child's value.

```typescript
import { withValue } from "servex/core/signal";

app.get("/nested", async (c) => {
  // Attach a value to a new sub-routine
  const routineA = withValue(c.routine(), "traceId", "abc-123");
  
  // Attach another value deeper down
  const routineB = withValue(routineA, "userId", "999");

  // routineB can read values from routineA
  console.log(routineB.value("traceId")); // "abc-123"
  console.log(routineB.value("userId"));  // "999"

  // routineA CANNOT read values from routineB
  console.log(routineA.value("userId"));  // undefined

  return c.text("Values logged");
});
```

## Trace API

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
