# Rule: Benchmarking Protocol

## Context

ServeX is driven by data. Changes to the hot path without empirical benchmark data are unacceptable. We optimize for sustained, warmed JIT throughput, not cold starts.

## Agent Directives

### Mandatory Benchmark Runs

- **Agent Action:** Whenever modifying `fetch.ts`, `SonicRouter`, or `compileHandlerChain`, you MUST run the benchmark suite. Do not assume your change is "obviously faster".

### Metrics that Matter

- **Agent Action:** When reporting results to the user, you must include **p999 tail latency** alongside median throughput. High tail latency indicates GC pressure (e.g., from polymorphic objects or excess slice allocations), which is a critical failure.
- **Agent Action:** Do not rely on median throughput alone to declare a change safe.

### Tooling Constraints

- Use `autocannon` for end-to-end benchmarks (default config: 200 concurrent connections).
- Use `mitata` for microbenchmarks focusing on object creation overhead and memory allocation patterns.
- Always compare against the Elysia baseline in the 6-way comparison.

### Zero Regression Policy

- **Agent Action:** If benchmark results show a regression (especially in p999 tail latency), DO NOT proceed with the PR or merge. You must identify the bottleneck or revert the change.
