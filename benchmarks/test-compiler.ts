import { compileHandlerChain } from "./src/compiler/index";
import type { Handler } from "./src/types";

const handlers: Handler[] = [
	async (context, next) => {
		console.log("Handler 1 start");
		await next();
		console.log("Handler 1 end");
	},
	(context, next) => {
		console.log("Handler 2 start");
		next();
		console.log("Handler 2 end");
	},
	async (context) => {
		console.log("Handler 3");
		return new Response("Response from Handler 3");
	},
];

const jit_code = compileHandlerChain(handlers);

console.log("Generated JIT code:\n", await jit_code());
