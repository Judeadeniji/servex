# Rule: Pull Requests & Commits

## Context

Clean, atomic Git history and well-documented Pull Requests are essential for reviewing performance-critical changes.

## Agent Directives

### Atomic Changes

- **Agent Action:** Keep changes scoped to a single concern (e.g., routing, middleware, benchmarks, or docs). If you find yourself mixing a stylistic refactor with a core performance fix, separate them into different branches/commits.

### Commit Messages

- **Agent Action:** Write commit messages using the imperative mood (e.g., `fix: prevent IC pollution in SonicRouter param capture` or `feat: add AOT route generation`). Do not use past tense (`fixed`) or progressive (`fixing`).

### PR Documentation

- **Agent Action:** When preparing a PR summary or description for a hot-path change, you MUST include the before/after benchmark results.
- **Agent Action:** In the PR description, explicitly reference the specific V8 or Bun behavior you are addressing if the PR is a performance optimization.
