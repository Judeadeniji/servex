# Rule: V8 & Bun JIT Optimization

## Context

V8 engine heuristics dictate ServeX's performance. You must write code that TurboFan can statically analyze and optimize, avoiding megamorphic states and Scavenger GC pauses.

## Agent Directives & Constraints

### Enforce Monomorphism

- **Rule:** Always initialize every potential property of an object at the moment of creation.
- **Agent Action:** When creating objects, use literals with all keys defined. Never add properties dynamically (e.g., avoid `obj.newProp = val` after initialization). Even if a value is absent, initialize it to `undefined` or `null`.
- **Reason:** Dynamic additions trigger hidden class transitions, leading to polymorphic or megamorphic property access (IC pollution), crippling performance.

### Avoid Array Manipulations in the Hot Path

- **Rule:** Do not use array spreading (`[...a, ...b]`) or array methods (`.concat()`, `.map()`) in the hot path.
- **Agent Action:** All array merging (e.g., middleware and handler chains) must happen Ahead-of-Time (AOT) during route registration. If you find yourself writing `...` or `.map()` inside a request handler, STOP and refactor it to AOT compilation.

### Control the Microtask Queue

- **Rule:** Allow synchronous routes to run strictly synchronously.
- **Agent Action:** Branch execution using `if (result instanceof Promise)` before `await`-ing. Do not make a function `async` unconditionally if it can return a synchronous value. This prevents yielding to the V8 event loop unnecessarily.

### AOT over JIT Allocations

- **Rule:** Keep closures and per-request allocations out of the hot path.
- **Agent Action:** When generating code (e.g., inside `SonicRouter`), ensure parameters and state are captured via object literals, not via inline closures created per-request. Cache C++ bridge lookups (like `process.env`) at the module level.
