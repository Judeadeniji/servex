# ServeX Features

This guide covers additional built-in features, APIs, and middlewares provided by ServeX.

## Plugins

ServeX allows you to modularize your application by passing sub-routers or plugin instances into `app.use()`.

```typescript
import { createServer } from "servex";
import myPlugin from "./my-plugin";

const app = createServer();

// Mounts the plugin logic to the /api prefix
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

## Storage API

ServeX provides lightweight storage abstractions out of the box, perfect for caching or managing data across requests.

```typescript
import { createStorage } from "servex/storage";

// Creates an ephemeral MemoryStorage adapter by default.
// Great for serverless platforms where disk access is wiped.
const store = createStorage();

await store.set("key", "value");
const data = await store.get("key");
```

## Signals (Request Cancellation)

Every request in ServeX carries an `AbortSignal` to gracefully handle timeouts or client disconnects. You can access it via `c.req.signal` or tap into the context's signal routine.

This is highly recommended for aborting outgoing `fetch` calls or database queries if the user cancels the request.

```typescript
app.get("/heavy-task", async (c) => {
  // Pass the signal to an external API call
  const data = await fetch("https://api.example.com/data", {
    signal: c.req.signal
  });

  return c.json(await data.json());
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
