# ServeX Router JIT Performance Autopsy

This document serves as a historical record of the optimizations, benchmarks, and catastrophic failures encountered while migrating ServeX's dynamic matching logic to a JIT-compiled Trie router (`SonicRouter`). 

## Background
We sought to close the performance gap between ServeX and Elysia (a fast Bun-native framework). To do so, we rebuilt our routing architecture:
1. **Native Static Responses:** We allowed users to pre-render static routes, injecting them directly into the underlying `Bun.serve({ static: app.static })` dictionary, skipping the router entirely for static paths.
2. **SonicRouter (Trie JIT):** We replaced the regex-based `TrieRouter` fallback with a flat, JIT-compiled match function generated dynamically from the router tree (`new Function()`).

## 1. Initial Findings: The AOT Mirage
Our initial, heavily-controlled 6-way benchmark yielded a surprising reality about AOT compilation:

* **ServeX (AOT) vs ServeX (No AOT):** Disabling AOT in ServeX *increased* throughput by ~6% (10,779 req/s -> 11,446 req/s).
* **ServeX Regex (AOT) vs ServeX Regex (No AOT):** Disabling AOT *increased* throughput by ~3% (11,527 req/s -> 11,840 req/s).
* **Elysia (AOT) vs Elysia (No AOT):** Disabling AOT *decreased* throughput by ~16% (11,218 req/s -> 9,682 req/s).

**Conclusion:** ServeX's base execution loop and parameter extraction are so well-optimized for the V8 Engine (Bun) that the massive string-compilation overhead of AOT actually caused V8 to de-optimize. Elysia, on the other hand, structurally relies on its AOT to achieve its performance.

## 2. The 30ms GC Tail Latency Spike
While ServeX (Regex/No-AOT) achieved `11,840 req/s` (beating Elysia), our brand new `SonicRouter` (Trie JIT) suffered from noticeably worse tail latency.

* **ServeX Regex (Interpreter) p999:** 106ms
* **ServeX Sonic (Trie JIT) p999:** 137ms

### The Trap
The culprit was the way `SonicRouter` handled parameter capture. The JIT generator emitted inline object literals to capture parameters:

```javascript
return { 
  matched: true, 
  params: { id: url.slice(10, 15) } // inline literal
};
```

Because different routes had different parameter keys (`id`, `sku`, `username`), V8 dynamically created a new **Hidden Class (Shape)** for every unique key arrangement. When these differently shaped objects flowed into our `fetch.ts` pipeline, V8's Inline Caches (ICs) went **megamorphic**, forcing the Garbage Collector to thrash as it tracked hundreds of unique Shape objects under heavy load.

## 3. The Dictionary Mode Fix (And The Catastrophe)
To stabilize the memory footprint and fix the 30ms tail latency, we attempted to hack V8's optimization heuristics. We changed the JIT generator to perfectly mirror the Interpreter's allocation pattern—forcing the `params` object into **Dictionary Mode** (a hash table):

```javascript
const params = {};
params["id"] = url.slice(10, 15);
return { ..., params: params };
```

### The Catastrophic Result
```text
                                       ServeX (Original JIT)  ServeX (Dictionary JIT)
─────────────────────────────────────────────────────────────────────────────────────
          Requests/sec                 11,673                 6,366   ▼ 45.5%
      Latency p999 (ms)                 137ms                 252ms   ▼ 84.0%
```

The "fix" cratered the throughput and pushed the tail latency to an astonishing 252ms. 

### The Autopsy: The Megamorphic Bailout
V8's optimizing compiler (TurboFan) has strict heuristics regarding function size and complexity. When we unrolled the dictionary assignment (`params[key] = ...`) into hundreds of distinct AST nodes inside a single, monolithic `new Function()`, we built a perfectly engineered weapon to destroy V8's optimization pipeline.

* **In the Interpreter:** The `matchAll` loop executes a single block of code repeatedly. V8 observes that single execution site, transitions the object to Dictionary Mode, and smoothly optimizes the hot loop.
* **In the JIT:** We forced TurboFan to look at hundreds of distinct, hardcoded property assignments scattered across a massive flat AST. TurboFan hit its optimization budget, triggered a massive **"Deopt / Too Complex"** bailout, and permanently dropped the router down to Ignition (the bytecode interpreter)—guaranteeing the slowest possible execution path for every single request.

## 4. The Law of Equivalent Exchange
This spectacular failure empirically proves the structural reality of flat JIT architectures in V8: **Inline object literals are the mandatory toll you must pay to keep V8's JIT compiler on the fast path.** 

We are effectively trading GC memory churn (the 30ms tail latency spike) for raw CPU throughput. Unifying the hidden classes inside a monolithic JIT function destroys the JIT optimization itself. This graveyard of failed optimizations stands as a permanent reminder of V8's optimization limits.
