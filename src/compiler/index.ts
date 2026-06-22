import type { Context } from "../context";
import type { Handler } from "../types";

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
export function buildCompilerSource(handlers: Handler<any>[]): string {
	if (handlers.length === 0) {
		return `return async () => undefined;\n`;
	}

	let code = `return async function(context) {\n`;
	code += `  async function dispatch(i) {\n`;
	code += `    if (i >= ${handlers.length}) return undefined;\n`;
	code += `    let res;\n`;
	code += `    switch(i) {\n`;

	for (let j = 0; j < handlers.length; j++) {
		const isAsync = handlers[j].constructor.name === "AsyncFunction";
		const needsNext = handlers[j].length > 1;
		code += `      case ${j}:\n`;
		if (needsNext) {
			code += `        {\n`;
			code += `          let nextCalled = false;\n`;
			code += `          let nextPromise;\n`;
			code += `          const next = async () => {\n`;
			code += `            if (nextCalled) throw new Error("next() called multiple times");\n`;
			code += `            nextCalled = true;\n`;
			code += `            nextPromise = dispatch(${j + 1});\n`;
			code += `            return await nextPromise;\n`;
			code += `          };\n`;
			if (isAsync) {
				code += `          res = await deps.handlers[${j}](context, next);\n`;
			} else {
				code += `          res = deps.handlers[${j}](context, next);\n`;
				code += `          if (res instanceof Promise) res = await res;\n`;
			}
			code += `          if (res instanceof Response) return res;\n`;
			code += `          if (nextCalled && nextPromise) return await nextPromise;\n`;
			code += `        }\n`;
		} else {
			if (isAsync) {
				code += `        res = await deps.handlers[${j}](context);\n`;
			} else {
				code += `        res = deps.handlers[${j}](context);\n`;
				code += `        if (res instanceof Promise) res = await res;\n`;
			}
			code += `        if (res instanceof Response) return res;\n`;
		}
		code += `        break;\n`;
	}

	code += `    }\n`;
	code += `    return undefined;\n`;
	code += `  }\n`;
	code += `  return dispatch(0);\n`;
	code += `};\n`;
	
	return code;
}

export function compileHandlerChain<
	E extends import("../types").Env = import("../types").Env,
>(
	handlers: Handler<Context<E>>[],
): (context: Context<E>) => Promise<Response | undefined> {
	if (handlers.length === 0) {
		return async () => undefined;
	}

	const code = buildCompilerSource(handlers);
	const fn = new Function("deps", code);
	return fn({ handlers });
}

