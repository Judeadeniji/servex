import { notFoundHandler } from "../basic-handlers";
import type { Context } from "../context";
import type { Handler, RequestHandler } from "../types";

/**
 * Handles errors gracefully by determining whether to throw the error
 * or return an appropriate HTTP response.
 *
 * @param error - The error object to handle.
 * @returns A tuple indicating whether to throw the error and the corresponding response.
 */
function handleErrorsGracefully(
  error: any
): { shouldThrow: boolean; response: Response } {
  if ("getResponse" in error) {
    return { shouldThrow: false, response: error.getResponse() };
  }

  console.error("Unhandled error:", error);
  return { shouldThrow: true, response: new Response("Internal Server Error", { status: 500 }) };
}

/**
 * Executes an array of handlers sequentially, allowing each to process the context
 * and optionally short-circuit the chain by returning a response.
 *
 * @param context - The execution context shared across handlers.
 * @param handlers - An array of handler functions to execute.
 * @param defaultHandler - The handler to execute if no other handler returns a response.
 * @returns The final HTTP response after processing all handlers.
 */
export async function executeHandlers(
  context: Context,
  handlers: Handler<Context>[],
  defaultHandler: RequestHandler<Context> = notFoundHandler
): Promise<Response> {
  let currentIndex = -1;
  let response: Response | undefined;
  const len = handlers.length;

  const next = async (): Promise<void> => {
    if (currentIndex >= len) {
      return;
    }
    currentIndex++;

    if (currentIndex < len) {
      const handler = handlers[currentIndex];
      let nextCalled = false;
      const handleNext = async () => {
        if (nextCalled) throw new Error("next() called multiple times");
        nextCalled = true;
        await next();
      };

      try {
        const result = await handler(context, handleNext);
        if (result instanceof Response) {
          response = result;
        }
      } catch (error) {
        if (error instanceof Error) {
          (error as Error & { handlerIndex?: number }).handlerIndex = currentIndex;
        }
        throw error;
      }
    }
  };

  try {
    await next();
  } catch (error) {
    context.debug && console.error(error);
    const { shouldThrow, response: errorResponse } = handleErrorsGracefully(error);
    if (shouldThrow) {
      throw error;
    }
    return errorResponse;
  }

  if (!response) {
    try {
      response = await defaultHandler(context, async () => {});
    } catch (error) {
      context.debug && console.warn(`Error in default handler:`, error);
      const { shouldThrow, response: errorResponse } = handleErrorsGracefully(error);
      if (shouldThrow) {
        throw error;
      }
      return errorResponse;
    }
  }

  return response;
}
