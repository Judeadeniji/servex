const ITERS = 100_000_000;

const start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = {
		matched: true,
		store: null,
		params: {},
	} as any;
	x.method = "GET";
	x.route = "/api/health";
	x.matched_route = "/api/health";
	x.data = "ok";
	x.middlewares = [];
}
console.log(`Add properties: ${(performance.now() - start).toFixed(2)}ms`);
