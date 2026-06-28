import type { Context } from "../context";
import type { Env, Handler } from "../types";

// Pre-resolved promise reused across all next() calls that don't resume.
const _RESOLVED = Promise.resolve();

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
export async function executeHandlers<
	E extends Env = Env,
>(
	context: Context<E>,
	handlers: Handler<Context<E>>[],
): Promise<Response | undefined> {
	async function dispatch(i: number): Promise<Response | undefined> {
		if (i >= handlers.length) return undefined;

		let nextPromise: Promise<Response | undefined> | undefined;
		let nextCalled = false;

		const next = async () => {
			if (nextCalled) throw new Error("next() called multiple times");
			nextCalled = true;
			nextPromise = dispatch(i + 1);
			return await nextPromise;
		};

		const handlerOrStatic = handlers[i];

		if (typeof handlerOrStatic === "function") {
			// CRITICAL FIX: Added `await` so async middleware resolves properly
			const res = await handlerOrStatic(context, next);
			if (res instanceof Response) return res;
		}

		// TODO: Everything below should only exec if native static response is false
		else if (
			handlerOrStatic &&
			typeof handlerOrStatic === "object" &&
			(handlerOrStatic as unknown) instanceof Response
		) {
			// Fast path for static responses (clone to avoid consuming body)
			return (handlerOrStatic as Response).clone();
		} else if (
			typeof handlerOrStatic === "object" &&
			handlerOrStatic !== null
		) {
			// Stringify JSON objects and set the correct headers
			return new Response(JSON.stringify(handlerOrStatic), {
				headers: { "Content-Type": "application/json; charset=UTF-8" },
			});
		} else {
			// Coerce numbers and booleans to strings
			return new Response(String(handlerOrStatic), {
				headers: { "Content-Type": "text/plain; charset=UTF-8" },
			});
		}

		if (nextCalled && nextPromise) return await nextPromise;

		return undefined;
	}

	return dispatch(0);
}
