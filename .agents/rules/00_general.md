# Rule: Before You Touch Anything

## Context & Core Principles

ServeX is an extremely performance-sensitive codebase. Seemingly innocent changes can cause massive performance regressions due to JIT de-optimizations or GC pressure.

## Agent Directives

- **Read First:** Before executing any edits on existing code, comprehensively read the relevant sections and their dependencies. Do not make blind edits.
- **Test Enforcement:** You MUST run `bun test` both before beginning your work (to establish a baseline) and after making changes. If any tests fail, revert your changes immediately and diagnose the issue. Do not proceed with further changes until tests pass.
- **Benchmark Enforcement:** If your changes touch the hot path (`fetch.ts`, `SonicRouter`, `compileHandlerChain`), you MUST run the benchmark suite in `benchmarks/` before and after. If performance degrades, you must abandon the approach.
- **Clarity Over Guesswork:** If you encounter a pattern or inline comment that you do not understand, STOP. Ask the user for clarification before modifying it. Do not assume you know better than the existing code in performance-critical sections.
