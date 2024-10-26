import { notFoundHandler } from "../basic-handlers";
import type { Context } from "../context";
import type { Env, Handler, RequestHandler } from "../types";

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
export async function executeHandlers
  <E extends Env>
(
  context: Context<E>,
  handlers: Handler<E>[],
  defaultHandler = notFoundHandler  as unknown as RequestHandler<E>
): Promise<Response> {
  let currentIndex = 0;
  let response!: Response;

  /**
   * Recursively invokes handlers in the chain.
   *
   * @param index - The current handler index to execute.
   */
  const invokeHandler = async (index: number): Promise<void> => {
    if (index >= handlers.length) {
      return;
    }

    const handler = handlers[index];
    let nextCalled = false;

    try {
      const handleNext = async () => {
        if (nextCalled) {
          throw new Error("next() called multiple times");
        }
        nextCalled = true;
        await invokeHandler(index + 1);
      };
      const result = await handler(context, handleNext);

      if (result instanceof Response) {
        response = result;
      }
    } catch (error) {
      // Attach the current handler index to the error for better debugging
      if (error instanceof Error) {
        (error as any).handlerIndex = index;
      }
      throw error;
    }
  };

  try {
    await invokeHandler(currentIndex);
  } catch (error) {
    context.debug && console.error(error);
    const { shouldThrow, response: errorResponse } = handleErrorsGracefully(error);
    if (shouldThrow) {
      throw error;
    }
    return errorResponse;
  }

  if (!response) {
    // Execute the default handler if no response has been set
    try {
      response = await defaultHandler(context, async () => {
        // Default handler typically does not call next()
      });
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
