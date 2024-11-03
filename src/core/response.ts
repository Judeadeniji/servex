import { notFoundHandler } from "../basic-handlers";
import type { Context } from "../context";
import type { RouterRoute, Params, ParamIndexMap, Result, RouteHandlerPair } from "../router/types";
import type { Env, Handler, RequestHandler } from "../types";

/**
 * Handles errors by determining whether to throw or return an HTTP response.
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
 * Executes an array of handlers in sequence, each processing the context.
 * @param context - The shared execution context for handlers.
 * @param handlers - Array of handler functions to execute.
 * @param defaultHandler - Fallback handler if no other returns a response.
 * @returns The final HTTP response after all handlers.
 */
export async function executeHandlers<E extends Env>(
  context: Context<E>,
  handlers: Handler<E>[],
  defaultHandler = notFoundHandler as unknown as RequestHandler<E, string>
): Promise<Response> {
  let response: Response | undefined;
  
  for (let i = 0; i < handlers.length; i++) {
    const handler = handlers[i];

    let nextCalled = false;

    try {
      const handleNext = async () => {
        if (nextCalled) throw new Error("next() called multiple times");
        nextCalled = true;
      };

      const result = await handler(context, handleNext);

      if (result instanceof Response) {
        response = result;
        break;
      }
    } catch (error) {
      if (error instanceof Error) (error as any).handlerIndex = i;
      context.debug && console.error(error);
      const { shouldThrow, response: errorResponse } = handleErrorsGracefully(error);
      if (shouldThrow) throw error;
      return errorResponse;
    }
  }

  // If no response from handlers, use default handler
  if (!response) {
    try {
      response = await defaultHandler(context, async () => {});
    } catch (error) {
      context.debug && console.warn(`Error in default handler:`, error);
      const { shouldThrow, response: errorResponse } = handleErrorsGracefully(error);
      if (shouldThrow) throw error;
      return errorResponse;
    }
  }

  return response!;
}
