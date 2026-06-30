# ServeX Helpers

ServeX provides several standalone, high-performance helpers located in `servex/helpers/*`.

## WebSockets

ServeX leverages native Bun WebSockets for immense throughput. You can easily bootstrap a WebSocket engine and route:

```typescript
import { createServer } from "servex";
import { createWebSocketManager } from "servex/helpers/websocket";

// Initialize the WebSocket manager with options
const { websocket, createHandler } = createWebSocketManager({
  maxPayloadLength: 1024 * 1024, // 1MB payload limit
});

const app = createServer();

// Define a WebSocket handler
const wsHandler = createHandler({
  message(ws, msg) {
    ws.send(`Echo: ${msg}`);
  },
  open(ws) {
    console.log("Client connected!");
  },
  close(ws, code, reason) {
    console.log(`Closed: ${code} ${reason}`);
  }
});

// Bind it to a route
app.get("/ws", (c) => wsHandler(c));

// You must pass the `websocket` object into Bun.serve!
Bun.serve({
  port: 3000,
  fetch: app.fetch,
  websocket, 
});
```

## Signed Cookies

ServeX allows you to cryptographically sign and verify cookies to prevent client-side tampering.

```typescript
import { 
  getSignedCookie, 
  setSignedCookie 
} from "servex/helpers/cookie";

const SECRET = "super-secret-server-key";

app.post("/login", async (c) => {
  // Signs "user-data" and sets it in the Set-Cookie header
  await setSignedCookie(c, "session", "user-data", SECRET, {
    httpOnly: true,
    secure: true
  });
  return c.text("Logged in");
});

app.get("/profile", async (c) => {
  // Parses the cookie and verifies the cryptographic signature
  const session = await getSignedCookie(c, "session", SECRET);
  
  if (!session) return c.text("Unauthorized or Tampered", 401);
  return c.text(`Welcome back, ${session}`);
});
```

You can also use the low-level `signCookie("value", SECRET)` and `verifyCookie(signedString, SECRET)` utilities manually.

## JWT Utilities

If you need to manually issue or verify JSON Web Tokens (outside of the standard middleware), use the native JWT helpers:

```typescript
import { sign, verify, decode } from "servex/helpers/jwt";

const SECRET = "secret-key-123";

// Issue a token
const token = await sign({ userId: 123, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);

// Verify a token
try {
  const payload = await verify(token, SECRET);
  console.log(payload.userId);
} catch (err) {
  console.error("Token is invalid or expired");
}

// Decode without verifying (e.g. just reading the header/payload)
const { header, payload } = decode(token);
```

## Show Routes

If you want to view a formatted list of all registered routes and their HTTP methods (great for debugging or CLI scripts), use `showRoutes`:

```typescript
import { showRoutes } from "servex/helpers/show-routes";

// To print to the console
showRoutes(app);

// To get the string back
const routeList = showRoutes(app, { returnString: true });
```
