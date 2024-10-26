import type {  Env, RequestHandler} from "./types";

export const notFoundHandler: RequestHandler<Env> = async (context) => {
  return context.text("Not Found", 404)
};
