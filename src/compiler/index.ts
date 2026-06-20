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
  code += `  let r;\n`;

  for (let i = 0; i < handlers.length; i++) {
    const handler = handlers[i];
    const isAsync = handler.constructor.name === "AsyncFunction";
    
    // Check if handler requests `next`
    const str = handler.toString();
    const paramsMatch = str.match(/^[^(]*\(\s*([^)]*)\)/);
    let hasNext = false;
    
    if (paramsMatch) {
      const params = paramsMatch[1].split(',').map(p => p.trim());
      if (params.length > 1 && params[1] !== "") {
        hasNext = true;
      }
    }

    code += `  // Handler ${i}\n`;
    if (hasNext) {
      code += `  let nextCalled${i} = false;\n`;
      code += `  const next${i} = () => { nextCalled${i} = true; return Promise.resolve(); };\n`;
      
      if (isAsync) {
        code += `  r = await deps.handlers[${i}](context, next${i});\n`;
      } else {
        code += `  r = deps.handlers[${i}](context, next${i});\n`;
        code += `  if (r instanceof Promise) r = await r;\n`;
      }
      
      code += `  if (r instanceof Response) return r;\n`;
      code += `  if (!nextCalled${i}) return;\n`;
    } else {
      if (isAsync) {
        code += `  r = await deps.handlers[${i}](context);\n`;
      } else {
        code += `  r = deps.handlers[${i}](context);\n`;
        code += `  if (r instanceof Promise) r = await r;\n`;
      }
      
      code += `  if (r instanceof Response) return r;\n`;
      code += `  return;\n`;
    }
  }

  code += `  return;\n`;
  code += `};\n`;

  const fn = new Function("deps", code);
  return fn({ handlers });
}
