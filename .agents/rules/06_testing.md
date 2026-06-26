# Rule: Testing Guidelines

## Context

ServeX relies on a robust test suite to catch regressions in routing logic, middleware chaining, and context mutations.

## Agent Directives

### Mandatory Testing

- **Agent Action:** Run `bun test` before making changes to understand the baseline, and after making changes to ensure nothing broke.
- **Agent Action:** If tests fail after your edits, you MUST halt and fix the regression before proceeding. Do not ignore failing tests.

### Test Coverage Requirements

- **Agent Action:** When introducing new routing behavior, modifying middleware execution order, or changing context mutation logic, you must write corresponding unit/integration tests.
- **Agent Action:** Focus on edge cases. Do not just test the happy path. You must write tests for:
  - Empty parameter segments
  - Trailing slashes
  - Wildcard collisions
  - Middleware short-circuits (early returns)

### Architectural Purity in Tests

- **Agent Action:** Do not mock the router or middleware chain in tests. You must test the real, fully-compiled pipeline to ensure AOT generation works correctly.
