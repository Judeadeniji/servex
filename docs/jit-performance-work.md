# ServeX Performance Work — Session Notes

## What This Document Is

A durable record of the JIT compiler investigation (Phase 1–3), written to prevent future contributors from re-attempting approaches that were already tested, measured, and found wanting. The "why not" answers are as important as the "what shipped" ones.

---

## Phase 1 — Executor JIT (`compileHandlerChain`)

**Status: closed, no performance claim.**

### What was attempted

`compileHandlerChain` (in `src/compiler/index.ts`) JIT-compiles an array of middleware handlers into a single flat async function using `new Function`. The hypothesis was that pre-allocated closures would reduce GC pressure and improve V8's ability to optimize monomorphic call sites vs. the generic `executeHandlers` loop.

### What the data showed

Two shapes were benchmarked across chain lengths 1, 3, 8, 20 (1M iterations each):

| Shape | Length 1 | Length 3 | Length 8 | Length 20 |
|---|---|---|---|---|
| `dispatch(i)` switch (current) | 1.10x | 0.88x | 0.85x | 1.12x |
| Closure-unrolled, no guard | 1.06x | 0.57x | — | — |

No monotonic signal in either direction. The GC hypothesis was disproved by profiling: JIT actually triggered *more* GC pauses at length 3, not fewer. The original 1.27–2.27x wins measured in early benchmarks were **not reproducible** after the dispatch correctness fix was applied.

### Why it can't be fixed with more codegen

The bottleneck is the number of `await` boundaries crossed per request. An N-handler chain requires N microtask ticks regardless of how the call sites are compiled, because each `await` suspends execution and re-enters the microtask queue. This is a runtime invariant that no JS-level `new Function` trick can escape. The only real lever here is a **sync-handler fast path**: detect at registration time whether a handler never returns a Promise and skip the `await` machinery for that handler. That's a distinct, narrower problem not attempted here.

### What remains from Phase 1

`compileHandlerChain` is kept because:
- It has correct short-circuit behavior (documented and tested in `tests/compiler-short-circuit.test.ts`)
- It's the hook for a future sync fast path without a public API change
- Removing it would be more churn than leaving it

It is **not** faster than `executeHandlers` for async chains. Do not re-attempt without first solving the microtask-tick constraint.

---

## Phase 2 — Router JIT (`SonicRouter`)

**Status: closed, shipped.**

### What shipped

The `SonicRouter.compile()` method now emits a JIT-compiled dynamic match function via `new Function` instead of scanning through a `matchMaps` array at runtime. The generated function directly embeds capture group indices and param key names as literals, eliminating the runtime loop.

**Benchmark (realistic mix: 30 routes, 10-URL mix including static/param/wildcard/404):**

| Router | Time (1M lookups) |
|---|---|
| SonicRouter (JIT) | 957ms |
| RadixRouter | 1,240ms |
| TrieRouter | 18,674ms |

**23% win over RadixRouter** on realistic mixed-traffic workloads.

### Two bugs fixed as byproducts

**1. Dynamic route precedence (was insertion-order-dependent)**

Before: dynamic routes were tried in raw registration order, so `/:id` registered before `/profile` would silently win for `/profile`.

After: `compile()` sorts a copy of the dynamic route array by `compareRouteSpecificity()` before building the regex alternation. Rule: compare segment-by-segment left-to-right; static < param < wildcard; ties broken by path length, then registration order. The source array is never mutated.

Tested in `tests/sonic-precedence.test.ts`.

**2. `sanitizeRoute()` was double-encoding pre-encoded URLs**

Before: called `encodeURI(route.replace(/^\/|\/$/g, ""))`. `encodeURI` encodes `%` to `%25`, which means any already-percent-encoded URL (every real HTTP request from a browser or curl) would be double-encoded internally and silently fail to match any route.

After: strips leading/trailing slashes using charCode comparisons only. No encoding or decoding.

**Performance side effect**: fixing `sanitizeRoute` dropped the realistic-mix benchmark from 2,785ms to 957ms — the actual bottleneck was a regex replace in the hot path, not the regex alternation or the JIT dispatch.

### Known limitation (documented and tested)

`sanitizeRoute` does not normalize encoding. A route registered as `/café` (raw unicode) will NOT match a request arriving as `/caf%C3%A9` (percent-encoded). URL normalization should happen at the reverse proxy/CDN layer. Explicitly tested in `tests/sonic-jit-correctness.test.ts`.

### Profiling approach (for future reference)

The bottleneck was found by isolating layers:

1. `router.match()` full call: 13,006ms (1M × 10 URLs)
2. Static map lookup only: 125ms (1%)
3. JIT matchFn directly: 1,237ms
4. `regex.exec()` alone: 91ms (7.3% of JIT fn time)

The 8.5x gap between (1) and (2)+(3) pointed at overhead inside `match()` before the JIT function ran. Isolating `router.match()` vs `matchFn()` directly showed a 12x overhead ratio — traced directly to `sanitizeRoute()`.

**Lesson: profile before theorizing about architectural changes.**

---

## Phase 3 — Mega-JIT (router + middleware fusion)

**Status: shelved.**

Contingent on Phase 1 having a real win to fuse with. If a sync-handler fast path is implemented and shows genuine gains, Phase 3 becomes worth revisiting. Not worth attempting until the handler-chain problem is independently solved.

---

## Benchmark Infrastructure

All benchmarks live in `benchmarks/`:

- `bench-router.ts` — realistic mix benchmark (30 routes, 10-URL mix)
- `bench-executor.ts` — isolated Phase 1 benchmark at chain lengths 1/3/8/20
- `profile-sonic.ts` — layer-by-layer profiler for SonicRouter
- `bench-unrolled.ts` — Phase 1 kill benchmark (closure-unrolling without guard)

Single-route repeated benchmarks are cache-hot best cases that don't reflect mixed-traffic behavior. Use `bench-router.ts` as the primary router performance signal.
