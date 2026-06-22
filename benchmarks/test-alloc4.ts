const ITERS = 100_000_000;

let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = {
		matched: true,
		method: "GET",
		route: "/api/health",
		matched_route: "/api/health",
		params: {},
		data: "ok",
		middlewares: [],
		store: null,
	};
}
console.log(`8 properties: ${(performance.now() - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = {
		matched: true,
		store: null,
		params: {},
	};
}
console.log(`3 properties: ${(performance.now() - start).toFixed(2)}ms`);
