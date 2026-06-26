# Rule: Documentation & Comments

## Context

In a highly-optimized framework, the "why" is more important than the "what". Code often looks unidiomatic because it is written to appease V8 heuristics.

## Agent Directives

### Preserve JSDoc and Inline Explanations

- **Agent Action:** NEVER remove existing JSDoc comments or inline explanations during refactoring, even if you think the code is self-explanatory. These comments often document subtle V8 behaviors or shape stability requirements.

### Documenting Non-Idiomatic Code

- **Agent Action:** If you write a block of code that looks strange or non-idiomatic (e.g., using a flat object literal instead of a class, or avoiding a standard array method), you MUST add a comment explaining *why*.
- **Agent Action:** The comment must explain the performance reason, what V8 heuristic is being targeted, and what would happen if the code were written "normally" (e.g., "Switching to a class here causes a TurboFan deopt on this call site").

### Meaningful Comments

- **Agent Action:** Do not write comments that merely restate the code (e.g., `// Adds 1 to i`).
- **Agent Action:** Do not leave `// TODO` comments without explicitly linking an issue or explaining the exact technical blocker.

### API Surface

- **Agent Action:** Ensure all public API surfaces (`ServeX`, `Context`, `Router`, middleware types) maintain comprehensive JSDoc annotations.
