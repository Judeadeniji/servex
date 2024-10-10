import type { Context } from "./context";
import type {  RequestHandler} from "./types";

export const notFoundHandler: RequestHandler<Context> = async (context) => {
  return context.text("Not Found", 404)
};
