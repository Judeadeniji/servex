import type { Context } from "../context";
import type { Env, Handler } from "../types";

/**
 * Executes an array of handlers sequentially with a single shared next().
 *
 * This is the **non-JIT slow path** used when AOT compilation is disabled.
 * The JIT fast path lives in `src/compiler/index.ts` which generates an
 * equivalent flat switch-based function string at startup.
 *
 * Key properties (must stay in sync with compiler/index.ts semantics):
 *  1. Only allocates a `next` closure when the handler accepts a second arg —
 *     identical to the compiler's `handler.length > 1` rule.
 *  2. Dispatch is recursive but bounded: at most N stack frames for N handlers.
 *  3. Errors thrown by handlers bubble to the caller — never caught here.
 *  4. `InlineHandler` branches are intentionally absent: `app.add()` wraps ALL
 *     inline static values (strings, numbers, plain objects, Response instances)
 *     into function closures **at route-registration time**, before they are
 *     stored in `route.handlers`. Both this function AND the JIT compiler
 *     therefore always receive an array of pure `function` values — the
 *     `typeof handler !== "function"` guard below is purely defensive.
 *
 * @returns The first `Response` returned by any handler, or `undefined`.
 * @throws  Re-throws any error from a handler for the caller to handle.
 */
export async function executeHandlers<E extends Env = Env>(
	context: Context<E>,
	handlers: Handler<Context<E>>[],
): Promise<Response | undefined> {
	const len = handlers.length;

	async function dispatch(index: number): Promise<Response | undefined> {
		if (index >= len) return undefined;

		let nextCalled = false;
		let nextPromise: Promise<Response | undefined> | undefined;

		const next = (): Promise<Response | undefined> => {
			if (nextCalled) throw new Error("next() called multiple times");
			nextCalled = true;
			nextPromise = dispatch(index + 1);
			return nextPromise;
		};

		const handler = handlers[index];

		// Only functions reach this path — InlineHandlers are handled by JIT.
		if (typeof handler !== "function") return undefined;

		const res = await handler(context as Context<E>, next);

		// Short-circuit on Response — errors are thrown not returned in async path.
		if (res instanceof Response) return res;

		// Handler called next() — propagate whatever the rest of the chain returned.
		if (nextCalled && nextPromise) return nextPromise;

		return undefined;
	}

	return dispatch(0);
}
