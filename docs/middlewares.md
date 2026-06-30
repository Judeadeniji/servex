# Built-in Middlewares

ServeX comes with a robust set of built-in middlewares located under `servex/middlewares/*` so you don't need to hunt for third-party packages for standard web server functionality.

## `serveStatic`

Serves static files (HTML, CSS, JS, Images) from a directory or a custom `StorageAdapter`.

```typescript
import { serveStatic } from "servex/middlewares/serve-static";

// By default, serves files from the `./public` folder.
// Resolves `/` to `index.html` by default.
app.use("/*", serveStatic());

// Custom Configuration
app.use("/assets/*", serveStatic({
  root: "./dist/assets",
  index: "default.html",
  // storage: myCloudStorageAdapter // For Edge environments without `node:fs`
}));
```

## `jwt`

Validates JSON Web Tokens (JWT) on incoming requests. Extracts the token from the `Authorization: Bearer <token>` header, or optionally from a configured cookie. Upon successful verification, the decoded payload is stored in the context variables.

```typescript
import { jwt } from "servex/middlewares/jwt";

// Protects all routes under /api
app.use("/api/*", jwt({
  secret: "my-super-secret-key",
  alg: "HS256", // Optional, defaults to HS256
  cookie: "auth_token" // Optional: also checks this cookie name
}));

app.get("/api/profile", (c) => {
  const payload = c.get("jwtPayload");
  return c.json({ user: payload });
});
```

## `rateLimiter`

Provides basic memory-based rate limiting to prevent abuse.

```typescript
import { rateLimiter } from "servex/middlewares/rate-limit";

app.use(rateLimiter({
  limit: 100, // Max requests per window
  window: 60, // Window duration in seconds
  // Custom key generator (defaults to IP address tracking)
  keyGenerator: (c) => c.req.headers.get("x-forwarded-for") || "global"
}));
```

## `compression`

Automatically compresses outgoing HTTP responses using gzip, deflate, or brotli based on the client's `Accept-Encoding` header. It respects Content-Length and won't compress tiny files.

```typescript
import { compression } from "servex/middlewares/compression";

app.use(compression({
  threshold: 1024 // Minimum response size in bytes to apply compression (Default: 1024)
}));
```

## `logger`

Logs incoming requests, methods, paths, status codes, and the total execution duration.

```typescript
import { logger } from "servex/middlewares/logger";

app.use(logger({
  // Optional: override the output stream (defaults to console.log)
  print: (str) => console.log(`[MyLogger] ${str}`),
  // Optional: fully format the log data
  format: (data) => `${data.method} ${data.path} - ${data.status} (${data.duration}ms)`
}));
```

## `basicAuth`

Provides simple HTTP Basic Authentication for quick administrative or private routes.

```typescript
import { basicAuth } from "servex/middlewares/basic-auth";

app.use("/admin/*", basicAuth({
  username: "admin",
  password: "secure_password",
  // OR provide a custom verification function:
  // verifyUser: async (user, pass, c) => await db.checkUser(user, pass)
}));
```

## `cors`

Adds standard Cross-Origin Resource Sharing headers.

```typescript
import { cors } from "servex/middlewares/cors";

app.use(cors({
  origin: "https://my-frontend.com", // String, array of strings, or dynamic function
  allowMethods: ["GET", "POST", "PUT"],
  allowHeaders: ["Authorization", "Content-Type"],
  exposeHeaders: ["X-Custom-Header"],
  credentials: true,
  maxAge: 86400
}));
```

## `validator`

Provides high-performance, agnostic schema validation (Zod, TypeBox, Valibot) via Standard Schema. Refer to the **Routing** documentation for full details on usage.
