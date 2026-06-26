# Rule: Static Analysis — Fallow

## Context

Fallow ensures architectural health by detecting dead code, duplicate logic, and structural decay (like cyclic dependencies).

## Agent Directives

### Continuous Analysis

- **Agent Action:** Run `fallow analyze --format json` before completing tasks that involve adding, removing, or renaming exports, functions, or modules.

### Strict Enforcement

- **Agent Action:** You must eliminate all dead code and unused exports flagged by Fallow. Do not leave code commented out or exported "just in case it's useful later." Remove it completely.
- **Agent Action:** If Fallow flags duplicate logic, you must consolidate the structurally identical code paths into a single shared utility.
- **Agent Action:** Address all `health` findings, especially cyclic dependencies and oversized modules.

### Configuration Integrity

- **Agent Action:** Do not modify `.fallowrc.json` to suppress categories of findings. The solution is always to fix the code, not the configuration.
- **Agent Action:** Do not add inline Fallow ignore annotations (`// fallow-ignore`) unless you add a comment proving why the finding is a false positive.
