# ServeX RPC

ServeX comes with a fully typed, high-performance Remote Procedure Call (RPC) system built directly into the framework. By leveraging Standard Schema and an intuitive API, ServeX RPC gives you seamless end-to-end type safety between your server and client without needing to generate types or use external tooling.

## Quick Start: Defining RPC Functions

The core building block of ServeX RPC is `createRPCFunction()`. It allows you to define your inputs, outputs, errors, and the actual handler.

```typescript
import { createRPCFunction } from "servex/rpc";
import { z } from "zod"; // You can use any Standard Schema compatible library

const sayHello = createRPCFunction()
  .input(z.object({ name: z.string() }))
  .handler(async (input, ctx) => {
    return { message: `Hello, ${input.name}!` };
  });
```

## Input, Output, and Error Validation

ServeX RPC uses [Standard Schema](https://github.com/standard-schema/standard-schema), making it compatible out-of-the-box with libraries like Zod, TypeBox, ArkType, and Valibot.

You can chain `.input()`, `.output()`, and `.error()` to strictly type and validate the data flowing through your RPC endpoints.

```typescript
import { createRPCFunction } from "servex/rpc";
import { HttpException } from "servex/http-exception";
import { z } from "zod";

const getUser = createRPCFunction()
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string(), name: z.string() }))
  .error(z.object({ code: z.literal("NOT_FOUND") }))
  .handler(async (input, ctx) => {
    // In a real app, query your database here
    const user = await database.findUser(input.id);
    
    if (!user) {
      // Return or throw an HttpException with typed data.
      // This maps perfectly to the .error() schema!
      return new HttpException({ 
        error: "TYPED_ERROR",
        statusCode: 404,
        message: "User could not be located",
        data: { code: "NOT_FOUND" } 
      });
    }
    
    return { id: user.id, name: user.name };
  });
```

> **Note:** Validation errors on `.input()` automatically return a `400 Bad Request` to the client, while `.output()` validation failures result in a `500 Internal Server Error` as they indicate a server-side bug.

## Nested Groups

For larger applications, you'll want to organize your RPC functions into logical domains. You can use `createRPCGroup()` to nest your functions and namespaces arbitrarily deep.

```typescript
import { createRPCGroup } from "servex/rpc";

const usersGroup = createRPCGroup().register({
  getUser,
  listUsers: createRPCFunction().handler(async () => {
    return [];
  }),
});

const adminGroup = createRPCGroup().register({
  deleteUser: createRPCFunction().handler(async () => { /* ... */ }),
});

// Combine everything into a root group or registry
export const rpcRegistry = {
  users: usersGroup,
  admin: adminGroup,
};
```

## RPC-Specific Middlewares

ServeX RPC allows you to attach middlewares directly to specific functions or entire groups. RPC middlewares receive an `RPCContext`, which extends the standard ServeX Context with additional metadata (like the function path and raw input).

```typescript
import type { RPCMiddleware } from "servex/rpc";

const requireAuth: RPCMiddleware = async (ctx, next) => {
  const token = ctx.req.headers.get("Authorization");
  if (!token) {
    return ctx.error(401, "Unauthorized");
  }
  await next();
};

const requireAdmin: RPCMiddleware = async (ctx, next) => {
  // ... authorization logic
  await next();
};

// Applying middleware to a single function
const sensitiveAction = createRPCFunction()
  .middlewares(requireAuth)
  .handler(async () => "Success");

// Applying middleware to an entire group
const protectedAdminGroup = createRPCGroup()
  .middlewares(requireAuth, requireAdmin)
  .register({
    sensitiveAction,
  });
```

## Serving the RPC Plugin

Once your registry is defined, you can mount it into your ServeX application using the `rpc` plugin.

```typescript
import { createServer } from "servex";
import { rpc } from "servex/rpc";
import { rpcRegistry } from "./router";

const app = createServer();

// The rpc() plugin converts your registry into a ServeX plugin
const rpcPlugin = rpc(rpcRegistry);

// Mount it to a specific route, e.g., /api/rpc
app.use("/api/rpc", rpcPlugin);

export type AppRPC = typeof rpcPlugin;
```

## The End-to-End Typed Client

With your server setup, creating the client is straightforward. `createRPCClient` gives you a Proxy-based client that mirrors the structure of your registry, offering full IDE autocomplete and type safety without code generation steps.

The client returns a `Result` type (`Ok` or `Err`), forcing you to handle potential errors explicitly and reducing runtime crashes.

```typescript
import { createRPCClient } from "servex/rpc";
import type { AppRPC } from "./server";

const client = createRPCClient<AppRPC>({
  baseURL: "http://localhost:3000",
  prefix: "/api/rpc", // Matches where you mounted the plugin on the server
});

async function run() {
  // 1. Call a nested RPC function
  // The input is strictly typed based on the Zod schema
  const result = await client.users.getUser({ id: "123" });

  // 2. Handle the Result explicitly
  if (result.isErr) {
    // result.error is fully typed, including your custom RPCTypedError schemas
    console.error("RPC Failed:", result.error.message);
    if (result.error.data?.code === "NOT_FOUND") {
        console.log("User was not found!");
    }
    return;
  }

  // 3. Unwrap and use the data
  const user = result.unwrap();
  console.log("User:", user.name);
}
```

### Client Options

When configuring `createRPCClient`, you can pass the following options:

- `baseURL`: The base URL of your API (e.g., `http://localhost:3000` or `https://api.example.com`).
- `prefix`: The route prefix where the RPC plugin is mounted (defaults to `/rpc` if omitted).
- `hash`: A hashing function to shorten URLs in production.
- `fetch`: Provide a custom fetch implementation. 

#### Bypassing the Network Stack for Testing
One of ServeX RPC's most powerful features is overriding the internal fetch implementation. By passing the `app.fetch` function directly, your RPC client can test your server without ever making a real network request or opening a port. This makes integration testing blazing fast:

```typescript
import { createServer } from "servex";
import { createRPCClient } from "servex/rpc";
import { rpcRegistry } from "./router";

const app = createServer();
const plugin = rpc(rpcRegistry);
app.use("/rpc", plugin);

// Zero-network integration test client!
const testClient = createRPCClient<typeof plugin>({
  baseURL: "http://localhost",
  fetch: async (url, init) => app.fetch(new Request(url, init)),
});

// Runs entirely in-memory
const res = await testClient.users.getUser({ id: "123" });
```
