# Rule: TypeScript & Code Standards

## Context

ServeX requires strict type safety to prevent runtime errors, with careful exceptions made only for JIT codegen where types cannot be statically verified.

## Agent Directives

### Strict Typing
- **Agent Action:** Every function, parameter, and return value must have explicit type annotations. Do not rely heavily on inference for public or module-level APIs.

### Compilation / Type Checking
- **Agent Action:** The project uses `tsgo` instead of `tsc` for TypeScript compilation and type checking. Do not run `tsc` or add it to any configuration or scripts. Whenever type checking is required, use `tsgo`.

### The `unknown` over `any` Rule

- **Agent Action:** Always use `unknown` instead of `any` by default.
- **Agent Action:** You may only use `any` if it is strictly required for JIT-level dynamic proxying or AOT codegen. If you use `any`, you MUST add an explicit inline comment explaining exactly why it is necessary. Unexplained `any` usage is a failure.

### No Type Casting to Bypass Errors

- **Agent Action:** Do not use `as` casts to suppress or bypass TypeScript errors. You must fix the underlying type definitions.
- **Agent Action:** Do not use `@ts-ignore` under any circumstances unless you include a detailed comment explaining the exact V8/Bun limitation or compiler bug that makes it necessary.

### JIT Code Readability

- **Agent Action:** Generated code strings (e.g., in `SonicRouter`) are real code. Format them properly with readable indentation and comments. Do not generate minified or unreadable code blobs.
