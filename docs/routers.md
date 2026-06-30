# Router Engines

ServeX is decoupled from its routing algorithm. Under the hood, it uses an Adapter pattern allowing you to swap out the entire routing engine by changing a single configuration property. 

```typescript
import { createServer } from "servex";
import { RouterType } from "servex";

const app = createServer({
  router: RouterType.SONIC // Defaults to SONIC
});
```

## Available Engines

### 1. `RouterType.SONIC` (Default)
The Sonic Router is ServeX's flagship engine. It is a highly optimized, specialized state-machine router designed specifically for the V8 engine.
- **When to use**: Almost always. It provides the highest baseline throughput for standard REST APIs.
- **Features**: Ultra-fast static route matching, zero-allocation path splitting.

### 2. `RouterType.RADIX`
A compressed Trie (Radix Tree) implementation.
- **When to use**: When you have an extremely complex routing table with hundreds of overlapping wildcards, or deeply nested dynamic parameters (`/api/:version/users/:id/posts/:slug`).
- **Features**: Memory-efficient. O(k) lookup time where `k` is the length of the path, regardless of how many routes are registered.

### 3. `RouterType.TRIE`
A standard prefix tree router.
- **When to use**: Generally superseded by `SONIC` and `RADIX`, but kept for compatibility and specialized edge cases where simple prefix matching outperforms node compression.

## Transparent API

Regardless of which engine you select, the `RouterAdapter` normalizes the API. Your code (`app.get()`, `app.use()`, wildcard matching, sub-routing) functions identically. The swap is purely a backend performance optimization.
