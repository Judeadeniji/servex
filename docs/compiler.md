# Internal Compiler (AOT & JIT)

ServeX achieves its extreme performance by abandoning traditional array-iteration middleware chains (like Express or Koa). Instead, it compiles the entire routing and middleware stack into a single, perfectly flat JavaScript function at runtime.

You can configure the compiler behavior when instantiating the server:

```typescript
const app = createServer({
  jit: true, // Just-In-Time compilation (Default: true)
  aot: false // Ahead-Of-Time compilation (Default: false)
});
```

## Why Compilation?

In standard frameworks, calling `await next()` creates a new closure, pushes to the call stack, and iterates over an array of functions. Over millions of requests, allocating these closures causes severe Garbage Collection (GC) pauses.

ServeX's `compileHandlerChain` converts your middleware arrays into a monolithic string evaluated via `new Function()`.

**The resulting compiled function:**

1. **Monomorphic Call Sites**: V8 and JavaScriptCore can optimize flat `switch` cases perfectly, preventing CPU pipeline stalls.
2. **Zero Allocations**: Allocates exactly 1 closure per request instead of `N` closures.
3. **State Optimization**: Uses a simple integer state machine to track `next()` calls, short-circuiting, and duplicate call prevention without array allocations.

## AOT vs. JIT

- **JIT (Just-In-Time)**: Handlers are compiled the *first time* a specific route is hit. This speeds up server boot time.
- **AOT (Ahead-Of-Time)**: Handlers for all registered routes are pre-compiled synchronously when you call `app.listen()`. This increases boot time by a few milliseconds but guarantees maximum throughput from the very first request. Recommended for high-load production environments.
