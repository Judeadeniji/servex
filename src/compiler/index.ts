import type { Context } from "../context";
import type { Handler } from "../types";

/**
 * JIT compiles an array of handlers into a single flat async function.
 * This version uses a recursive dispatch loop with an explicit switch statement.
 *
 * Why?
 * 1. Monomorphic Call Sites: V8 can optimize the switch cases perfectly.
 * 2. Correctness: It perfectly mimics the `executeHandlers` closure scope,
 *    ensuring that `next()` short-circuiting and implicit response propagation work.
 */
export function compileHandlerChain<E extends import("../types").Env = import("../types").Env>(handlers: Handler<Context<E>>[]): () => Promise<unknown> {
	if (handlers.length === 0) {
		return async () => undefined;
	}

	let code = `const RESOLVED = Promise.resolve(undefined);\n`;
	code += `return async function(context) {\n`;
	code += `  async function dispatch(i) {\n`;
	code += `    if (i >= ${handlers.length}) return undefined;\n`;
	code += `    let nextPromise;\n`;
	code += `    let nextCalled = false;\n`;
	code += `    const next = async () => {\n`;
	code += `      if (nextCalled) throw new Error("next() called multiple times");\n`;
	code += `      nextCalled = true;\n`;
	code += `      nextPromise = dispatch(i + 1);\n`;
	code += `      return await nextPromise;\n`;
	code += `    };\n`;
	code += `    let res;\n`;
	code += `    switch(i) {\n`;

	for (let i = 0; i < handlers.length; i++) {
		const isAsync = handlers[i].constructor.name === "AsyncFunction";
		code += `      case ${i}:\n`;
		if (isAsync) {
			code += `        res = await deps.handlers[${i}](context, next);\n`;
		} else {
			code += `        res = deps.handlers[${i}](context, next);\n`;
			code += `        if (res instanceof Promise) res = await res;\n`;
		}
		code += `        break;\n`;
	}

	code += `    }\n`;
	code += `    if (res instanceof Response) return res;\n`;
	code += `    if (nextCalled && nextPromise) return await nextPromise;\n`;
	code += `    return undefined;\n`;
	code += `  }\n`;
	code += `  return dispatch(0);\n`;
	code += `};\n`;

	const fn = new Function("deps", code);
	return fn({ handlers });
}
