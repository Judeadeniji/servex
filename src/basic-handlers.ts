import type { Context } from "./context";
import type { Handler } from "./types";

export const notFoundHandler: Handler<Context> = async (context) => {
	return context.text("Not Found", 404);
};
