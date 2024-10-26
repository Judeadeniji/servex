import type {  Env, RequestHandler} from "./types";

export const notFoundHandler: RequestHandler<Env, "/404"> = async (context) => {
  return context.text("Not Found", 404)
};
