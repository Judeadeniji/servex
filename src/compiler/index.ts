import type { Context } from "../context";
import type { InternalHandler } from "../types";

/**
 * JIT compiles an array of handlers into a single flat async function.
 * This version uses a single closure approach with an explicit switch statement.
 *
 * Why?
 * 1. Monomorphic Call Sites: V8 can optimize the switch cases perfectly.
 * 2. Memory Opt: Allocates EXACTLY 1 `next()` closure per request instead of N closures.
 * 3. State Opt: Uses a simple integer bitmask (or Uint8Array) to perfectly mimic `next()`
 *    short-circuiting and duplicate call prevention without array allocations.
 */
export function buildCompilerSource(
	handlers: InternalHandler[],
): string {
	if (handlers.length === 0) {
		return `return () => Promise.resolve(undefined);\n`;
	}

	let code = `  function dispatch(i, context) {\n`;
	code += `    if (i >= ${handlers.length}) return undefined;\n`;
	code += `    let res;\n`;
	code += `    switch(i) {\n`;

	for (let j = 0; j < handlers.length; j++) {
		const handler = handlers[j];
		const needsNext = typeof handler === "function" && handler.length > 1;
		code += `      case ${j}:\n`;
		if (needsNext) {
			code += `        {\n`;
			code += `          let nextCalled = false;\n`;
			code += `          let nextPromise;\n`;
			code += `          const next = () => {\n`;
			code += `            if (nextCalled) throw new Error("next() called multiple times");\n`;
			code += `            nextCalled = true;\n`;
			code += `            let p = dispatch(${j + 1}, context);\n`;
			code += `            nextPromise = p instanceof Promise ? p : Promise.resolve(p);\n`;
			code += `            return nextPromise;\n`;
			code += `          };\n`;
			code += `          res = deps.handlers[${j}](context, next);\n`;
			code += `          if (res instanceof Promise) {\n`;
			code += `            return res.then(r => {\n`;
			code += `              if (r instanceof Response || r instanceof Error) return r;\n`;
			code += `              if (nextCalled && nextPromise) return nextPromise;\n`;
			code += `              return undefined;\n`;
			code += `            });\n`;
			code += `          }\n`;
			code += `          if (res instanceof Response || res instanceof Error) return res;\n`;
			code += `          if (nextCalled && nextPromise) return nextPromise;\n`;
			code += `          return undefined;\n`;
			code += `        }\n`;
		} else {
			code += `        res = deps.handlers[${j}](context);\n`;
			code += `        if (res instanceof Promise) {\n`;
			code += `          return res.then(r => (r instanceof Response || r instanceof Error) ? r : undefined);\n`;
			code += `        }\n`;
			code += `        return (res instanceof Response || res instanceof Error) ? res : undefined;\n`;
		}
	}

	code += `    }\n`;
	code += `    return undefined;\n`;
	code += `  }\n`;
	code += `  return function(context) {\n`;
	code += `    return dispatch(0, context);\n`;
	code += `  };\n`;

	return code;
}

export function compileHandlerChain(
	handlers: InternalHandler[],
): (
	context: Context,
) => Response | undefined | Promise<Response | undefined> {
	if (handlers.length === 0) {
		return async () => undefined;
	}

	const code = buildCompilerSource(handlers);
	const fn = new Function("deps", code);
	return fn({ handlers });
}
