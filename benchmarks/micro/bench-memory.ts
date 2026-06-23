import { bench, group, run } from "mitata";
import { compileHandlerChain } from "../../src/compiler/index";
import { type Context, createContext } from "../../src/context";

// A mock handler that simulates real work (allocating objects)
const handler = (c: Context, next: () => void) => {
	// Allocate some memory to generate garbage
	const obj = { data: new Array(100).fill(Math.random()) };
	c.set("obj", obj);
	if (next) return next();
	return new Response("OK");
};

const terminalHandler = (c: Context) => {
	const obj = { data: new Array(100).fill(Math.random()) };
	c.set("obj", obj);
	return new Response("OK");
};

function runNative(handlers: Function[], ctx: Context) {
	let i = 0;
	const next = () => {
		i++;
		if (i >= handlers.length) return undefined;
		return handlers[i](ctx, next);
	};
	handlers[0](ctx, next);
}

const ctx = createContext(new Request("http://localhost/"), {}, { params: {} });

// Short Chain (3)
const shortHandlers = [handler, handler, terminalHandler];
const compiledShort = compileHandlerChain(shortHandlers);

// Long Chain (9)
const longHandlers = [
	handler,
	handler,
	handler,
	handler,
	handler,
	handler,
	handler,
	handler,
	terminalHandler,
];
const compiledLong = compileHandlerChain(longHandlers);

group("Memory", () => {
	group("Short Chain", () => {
		bench("Native", () => runNative(shortHandlers, ctx));
		bench("Compiled", () => compiledShort(ctx));
	});

	group("Long Chain", () => {
		bench("Native", () => runNative(longHandlers, ctx));
		bench("Compiled", () => compiledLong(ctx));
	});
});

await run();
