# Rule: Core Principles (What This Codebase Is Not)

## Context

Agents often try to normalize codebases by applying standard full-stack web development patterns (like adding massive generic middleware, OOP abstractions, or Node.js compatibility). ServeX rejects these defaults.

## Agent Directives

### Reject Ergonomics Over Performance

- **Agent Action:** If a requested change or refactor makes the code more "readable" or "ergonomic" but measurably degrades performance, REJECT the change. Performance is the non-negotiable priority.

### No Unbenchmarked Abstractions

- **Agent Action:** Do not introduce "clean architecture" abstractions, design patterns, generic factories, or excessive layering unless they have been explicitly benchmarked and proven to have zero overhead.

### Strict Bun Exclusivity

- **Agent Action:** ServeX is built natively for Bun. Do not use Node.js built-ins. Do not add Node compatibility shims. Do not attempt to make the codebase run on Node or Deno.
