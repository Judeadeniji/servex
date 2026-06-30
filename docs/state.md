# State & Storage

Managing data securely and efficiently across requests and lifecycles is essential. ServeX provides robust primitives for both request-scoped State (via Context Variables) and global/ephemeral Storage (via Storage Adapters).

## Request-Scoped State (Context Variables)

When data needs to survive across multiple middlewares within the lifecycle of a single request, ServeX provides a fully typed `c.set()` and `c.get()` API directly on the `Context`.

### Injecting State via Middlewares

By leveraging the generic `Env` type parameter on your router, you can enforce strict type safety for your context variables. This ensures you never accidentally request a variable that hasn't been set or typed correctly.

```typescript
import { createServer } from "servex";

type AppEnv = {
  Variables: {
    user: { id: string; role: "admin" | "user" };
    requestId: string;
  };
};

// Pass the Env type to the server instantiation
const app = createServer<AppEnv>();

// Middleware injects the state
app.use(async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  
  // TypeScript enforces the exact 'user' shape defined in AppEnv
  c.set("user", { id: "123", role: "admin" });
  
  await next();
});

// Downstream routes consume the state
app.get("/profile", (c) => {
  const user = c.get("user"); // Fully typed!
  const reqId = c.get("requestId");
  
  return c.json({ user, reqId });
});
```

## Global Storage Adapters

For data that needs to persist across multiple requests (such as sessions, cached API responses, or rate-limit tracking), ServeX exposes highly generic `StorageAdapter` implementations.

### Built-in Adapters

1. **`MemoryStorage`**: An ephemeral, high-throughput in-memory map. Perfect for serverless environments (like Cloudflare Workers or Deno Deploy) where disk access is either forbidden or wiped between invocations.
2. **`FSStorage`**: A standard `node:fs` backed persistent storage adapter that writes data natively to the local disk.

```typescript
import { createStorage, FSStorage } from "servex/storage";

// 1. In-Memory (Ephemeral)
const memStore = createStorage(); // Defaults to MemoryStorage
await memStore.set("session_123", "data");

// 2. File System (Persistent)
const diskStore = new FSStorage({ dir: "./.cache" });
await diskStore.set("config", JSON.stringify({ theme: "dark" }));

const data = await diskStore.getString("config");
```

### The Standard Interface

All Storage adapters implement the exact same interface, making it trivial to swap them out depending on where your ServeX app is deployed without changing any application logic:

- `set(key: string, value: Uint8Array | string)`: Writes data.
- `get(key: string)`: Returns the raw byte array (`Uint8Array | null`).
- `getString(key: string)`: Returns the decoded UTF-8 string (`string | null`).
- `delete(key: string)`: Removes the entry.
- `has(key: string)`: Checks existence.
- `keys(prefix?: string)`: Returns all keys, optionally filtered by a prefix.
- `clear()`: Wipes the entire store.
