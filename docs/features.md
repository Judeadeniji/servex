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
