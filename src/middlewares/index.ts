import { executeHandlers } from "../core/response";
import type {
	Context,
	Handler,
	MiddlewareHandler,
	NextFunction,
} from "../types";

export class MiddlewareManager<T extends Context> {
	private middlewares: MiddlewareHandler<T>[] = [];

	use(middleware: MiddlewareHandler<T>) {
		this.middlewares.push(middleware);
	}

	async execute(context: T) {
		let index = -1;

		const dispatch = async (i: number): Promise<void> => {
			if (i <= index) {
				throw new Error("next() called multiple times");
			}
			index = i;
			const middleware = this.middlewares[i];
			if (middleware) {
				await middleware(context, () => dispatch(i + 1));
			}
		};

		await dispatch(0);
	}
}

// flatten handlers into one single fu
export function flattenHandlers<T extends Context>(handlers: Handler<T>[]) {
	return ((c: T, _n: NextFunction) => {
		return executeHandlers(c as Context, handlers as Handler<Context>[]);
	}) as Handler<T>;
}
