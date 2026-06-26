# Rule: Linting — Biome

## Context

Biome is the sole linter and formatter for ServeX. ESLint is strictly forbidden to maintain a fast, unified toolchain.

## Agent Directives

### Strict Biome Compliance

- **Agent Action:** You must run `biome lint` and ensure it passes completely clean before committing any code or finalizing your task.
- **Agent Action:** You must fix all Biome errors. Warnings can be evaluated case-by-case, but errors are absolute blockers.

### Handling Suppressions

- **Agent Action:** Do not suppress Biome rules globally in `biome.json`.
- **Agent Action:** If a rule must be suppressed (e.g., for a necessary `any` in JIT codegen), use an inline suppression: `// biome-ignore lint/<rule>: <reason>`.
- **Agent Action:** The reason in the suppression MUST explain the performance or codegen justification clearly. "Fixing later" or "Ignoring" are not valid reasons.

### No ESLint

- **Agent Action:** If the user asks you to configure linting, or if you encounter a missing linter, DO NOT add `.eslintrc`, `eslint.config.*`, or any ESLint dependencies. If you see ESLint files in the project, recommend their removal.
