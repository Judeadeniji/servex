Ah, my apologies! I misunderstood your previous instruction. You wanted me to literally update the markdown document you provided by permanently writing our newly established V8 rules (Shape Stability, GC Avoidance, Microtask Thrashing, and Interop Caching) directly into the official contributor guidelines.

Here is the fully updated, finalized document with the new performance laws integrated seamlessly into the framework's strict architectural standards.

---

# ServeX — Agent Rules & Contributor Guidelines

ServeX is a high-performance, TypeScript-first HTTP framework built natively for Bun. Performance is the non-negotiable priority. Every architectural decision in this codebase exists for a reason. Do not change patterns without understanding why they exist.

---

## 0. Before You Touch Anything

* Read every section of this document before making any change.
* Run `bun test` before and after every change. If tests fail after your change, do not proceed.
* Run the benchmark suite in `benchmarks/` before and after any change to the hot path (`fetch.ts`, `SonicRouter`, `compileHandlerChain`).
* If you do not understand a pattern or inline comment, ask before changing it.

---

## 1. V8 & Bun JIT Optimization

### Do

* **Enforce Shape Stability (Monomorphism):** Always initialize every potential property of an object at the moment of its creation, even if the value is `undefined` or `null`. Keep property order strictly consistent to ensure V8 assigns a single, highly-optimized Hidden Class.
* **Cache C++ Bridge Lookups:** Resolve `process.env` and other expensive host-environment bindings exactly once at the module level.
* **Manage the Microtask Queue:** Branch execution using `if (result instanceof Promise)` before `await`-ing generic returns. This allows synchronous routes to run strictly synchronously without yielding to the V8 event loop.
* Use object literals for parameter capture in JIT-generated code.
```ts
// Correct
return { params: { id: value } };

```


* Keep closures out of the hot path unless they are AOT-compiled at route registration time, not per-request.
* Write code that can be statically analyzed by TurboFan. Predictable shapes, predictable branches.

### Do Not

* **Do not use array spreading (`[...a, ...b]`) or array methods (`.concat()`, `.map()`) in the hot path.** All array merging (e.g., middleware and handler chains) must happen Ahead-of-Time (AOT) during route registration to starve the Scavenger Garbage Collector.
* **Do not conditionally omit properties or dynamically add them after initialization.** This triggers memory transitions, causing shape forking and Megamorphic de-optimizations.
* Do not unroll property assignments into flat, massive ASTs in generated code. This causes TurboFan bailouts.
```ts
// Wrong — megamorphic, causes IC pollution, triggers transitions
const p: any = {};
p.id = segments[1];
p.slug = segments[2];
return p;

```


* Do not introduce runtime type checks, `typeof` guards, or conditional branches that could be resolved at compile time.
* Do not add new heavyweight class instantiations to the hot path (`fetch.ts`). `Context` is already an accepted overhead. Do not add more.

---

## 2. Architecture

### Do

* Use `SonicRouter` (Trie JIT) as the default router. It compiles the entire route tree into a single function string at startup.
* Inject static or pre-rendered routes directly into `Bun.serve({ static: app.static })`. These bypass the router entirely and must stay that way.
* Follow the `(ctx, next)` middleware pattern. The AOT compiler allocates a `next` closure only when `handlers[j].length > 1`. Preserve this condition check.
* Use flat object literals for all internal structures that are not user-facing.

### Do Not

* Do not bypass `SonicRouter` for dynamic routes by adding ad-hoc matching logic anywhere in `fetch.ts`.
* Do not add per-request allocations (arrays, objects, closures) inside `compileHandlerChain` output. These are hot-path allocations.
* Do not add new top-level abstractions (classes, factories, registries) to the routing or middleware layer without a benchmark justification.
* Do not modify the `static` injection mechanism. Bun handles these natively; wrapping them in the router pipeline defeats the purpose.

---

## 3. Benchmarking

### Do

* Run the full benchmark suite (`benchmarks/`) for any change touching `fetch.ts`, `SonicRouter`, or `compileHandlerChain`.
* Use `autocannon` for end-to-end benchmarks. The standard configuration is 200 concurrent connections.
* Use `mitata` for microbenchmarks: object creation overhead, memory allocation patterns, specific V8 function behavior.
* Report **p999 tail latency** alongside median throughput. GC pressure from polymorphic objects or excess `slice` allocations surfaces in tail latency, not medians.
* Compare against Elysia in the standard 6-way comparison. This is the reference baseline.

### Do Not

* Do not merge hot-path changes without benchmark results showing no regression.
* Do not rely on median throughput alone to declare a change safe.
* Do not write microbenchmarks that measure cold-start behavior — ServeX is optimized for sustained, warmed JIT throughput.

---

## 4. TypeScript & Code Standards

### Do

* Use strict TypeScript throughout. Every function, parameter, and return value must be typed.
* Use `unknown` over `any`. If `any` is required for JIT-level dynamic proxying or codegen, add an explicit comment explaining why.
* Use explicit return types on all exported functions.
* Keep generated code strings (in `SonicRouter`) readable and annotated. They are code, not blobs.

### Do Not

* Do not use `any` without a comment. Unexplained `any` will be rejected.
* Do not use `as` casts to bypass type errors. Fix the types.
* Do not introduce new external runtime dependencies without discussion. ServeX's dependency footprint must stay minimal.
* Do not use `@ts-ignore` without a comment explaining the exact reason.

---

## 4a. Linting — Biome

Biome is the linter. There is no ESLint. Do not add ESLint.

### Do

* Run `biome lint` before committing. It is enforced locally and must pass clean.
* Fix all Biome errors before opening a PR. Warnings are reviewed case-by-case but errors are blocking.
* Use `// biome-ignore lint/<rule>: <reason>` for any intentional suppression. The reason must explain the performance or codegen justification.
```ts
// biome-ignore lint/suspicious/noExplicitAny: JIT codegen requires dynamic proxy typing
function compile(handler: any): string { ... }

```



### Do Not

* Do not add `.eslintrc`, `eslint.config.*`, or any ESLint configuration. This codebase does not use ESLint.
* Do not suppress Biome rules globally in `biome.json`. Suppressions must be inline and scoped to the exact line.
* Do not open a PR with Biome errors. The reviewer will close it without review.

---

## 4b. Static Analysis — Fallow

Fallow runs the full analysis suite (`dead-code`, `dupes`, `health`) against the codebase. You can always append `--format json` to any Fallow command. Configuration lives in `.fallowrc.json`. Do not modify `.fallowrc.json` without discussion.

### Do

* Run `fallow analyze --format json` before opening any PR that adds, removes, or renames exports, functions, or modules.
* Eliminate dead code flagged by Fallow before submitting. Unused exports and unreachable branches are not acceptable in a performance-critical codebase.
* Resolve duplicate logic flagged by Fallow. If two code paths are structurally identical, consolidate them.
* Address all `health` findings. These surface structural issues (cyclic deps, oversized modules, unsafe patterns) that compound over time.

### Do Not

* Do not add Fallow ignore annotations (`// fallow-ignore`) without a comment explaining why the finding is a false positive.
* Do not leave dead exports in place because they "might be useful later." Remove them. If they are needed, they will be added back with a purpose.
* Do not modify `.fallowrc.json` to suppress categories of findings. Fix the code, not the config.

---

## 5. Documentation & Comments

### Do

* Preserve all existing JSDoc comments and inline explanations. These document V8 heuristics that are not obvious from the code alone.
* Add a comment whenever you write non-idiomatic code for performance reasons. Explain what, why, and what happens if it's changed.
```ts
// Using object literal instead of class to keep IC monomorphic.
// Switching to a class here causes a TurboFan deopt on this call site.

```


* Document new V8 or Bun-specific behaviors you discover, including the version they were observed on.
* Keep JSDoc on all public API surface (`ServeX`, `Context`, `Router`, middleware types).

### Do Not

* Do not remove comments from non-idiomatic code even if the code seems self-explanatory.
* Do not add comments that restate what the code does. Comments must explain *why*.
* Do not leave TODO comments without a linked issue or an explanation of the blocker.

---

## 6. Testing

### Do

* Run `bun test` before and after every change.
* Write tests for any new routing behavior, middleware execution order change, or context mutation.
* Test edge cases: empty param segments, trailing slashes, wildcard collisions, middleware short-circuits.

### Do Not

* Do not merge changes that break existing tests.
* Do not mock the router or middleware chain in tests. Test the real pipeline.
* Do not write tests that only cover the happy path for performance-sensitive code. Test degenerate inputs.

---

## 7. Pull Requests & Commits

### Do

* Scope each PR to a single concern: routing, middleware, benchmarks, docs. Mixed PRs will be asked to split.
* Include benchmark results (before/after) in the PR description for any hot-path change.
* Write commit messages in the imperative: `fix: prevent IC pollution in SonicRouter param capture`.
* Reference the specific V8/Bun behavior you are addressing in the PR description if relevant.

### Do Not

* Do not open a PR for a hot-path change without benchmark data.
* Do not bundle refactors with performance fixes. They must be separate PRs.
* Do not force-push to a branch with an open PR without notice.
* Do not merge your own PR. At least one review is required.

---

## 8. What This Codebase Is Not

* It is not a general-purpose framework designed for ergonomics over performance.
* It is not a place to experiment with abstractions that have not been benchmarked.
* It is not compatible with Node.js. Do not add Node compatibility shims.

If a change makes the code more readable but measurably slower, it is the wrong change.
