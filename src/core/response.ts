import { notFoundHandler } from "../basic-handlers";
import type { Context } from "../context";
import type { Handler } from "../types";

// Pre-resolved promise reused across all next() calls that don't resume.
const RESOLVED = Promise.resolve();

/**
 * Executes an array of handlers sequentially with a single shared next().
 *
 * Key optimizations vs the original:
 *  1. One `next` closure per request (vs one per handler in the old version).
 *  2. Flat `while` loop — no recursion, no extra async frame per step.
 *  3. Pre-resolved Promise.resolve() returned from next() avoids microtask allocation.
 *  4. No wrapper try/catch inside the loop — errors bubble to the caller.
 *  5. No intermediate handler array allocation — caller passes slices or
 *     combined arrays directly.
 *
 * @returns The first Response returned by any handler, or undefined if none.
 * @throws  Re-throws any error from a handler for the caller to handle once.
 */
export async function executeHandlers(
  context: Context,
  handlers: Handler<Context>[]
): Promise<Response | undefined> {
  const len = handlers.length;
  if (len === 0) return undefined;

  let idx = 0;

  // Single next per request — just increments the shared index.
  const next = (): Promise<void> => {
    idx++;
    return RESOLVED;
  };

  while (idx < len) {
    const before = idx;
    const result = await handlers[idx](context, next);
    if (result instanceof Response) return result;
    // Handler didn't call next() AND didn't return a Response → chain stops.
    if (idx === before) break;
  }

  return undefined;
}
