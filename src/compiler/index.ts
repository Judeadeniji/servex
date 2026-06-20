import type { Context } from "../context";
import type { Handler } from "../types";

/**
 * JIT compiles an array of handlers into a single flat async function.
 * This eliminates the closure overhead of `next()` and the microtask overhead
 * of recursively awaiting handlers.
 */
export function compileHandlerChain(handlers: Handler<Context>[]): Function {
  if (handlers.length === 0) {
    return async () => undefined;
  }

  let code = `return async function(context) {\n`;
  
  for (let i = handlers.length - 1; i >= 0; i--) {
    const handler = handlers[i];
    const isAsync = handler.constructor.name === "AsyncFunction";
    
    const str = handler.toString();
    const paramsMatch = str.match(/^[^(]*\(\s*([^)]*)\)/);
    let hasNext = false;
    
    if (paramsMatch) {
      const params = paramsMatch[1].split(',').map(p => p.trim());
      if (params.length > 1 && params[1] !== "") {
        hasNext = true;
      }
    }

    code += `  const next${i} = async () => {\n`;
    code += `    let nextResult;\n`;
    code += `    let res;\n`;
    
    if (hasNext) {
      code += `    let nextCalled = false;\n`;
      code += `    const next = async () => {\n`;
      code += `      if (nextCalled) throw new Error("next() called multiple times");\n`;
      code += `      nextCalled = true;\n`;
      if (i + 1 < handlers.length) {
        code += `      nextResult = await next${i+1}();\n`;
      } else {
        code += `      nextResult = undefined;\n`;
      }
      code += `      return nextResult;\n`;
      code += `    };\n`;
      
      if (isAsync) {
        code += `    res = await deps.handlers[${i}](context, next);\n`;
      } else {
        code += `    res = deps.handlers[${i}](context, next);\n`;
        code += `    if (res instanceof Promise) res = await res;\n`;
      }
      
      code += `    if (res instanceof Response) return res;\n`;
      code += `    if (nextCalled) return nextResult;\n`;
      code += `    return undefined;\n`;
      
    } else {
      if (isAsync) {
        code += `    res = await deps.handlers[${i}](context);\n`;
      } else {
        code += `    res = deps.handlers[${i}](context);\n`;
        code += `    if (res instanceof Promise) res = await res;\n`;
      }
      code += `    if (res instanceof Response) return res;\n`;
      code += `    return undefined;\n`;
    }
    
    code += `  };\n`;
  }
  
  code += `  return await next0();\n`;
  code += `};\n`;

  const fn = new Function("deps", code);
  return fn({ handlers });
}
