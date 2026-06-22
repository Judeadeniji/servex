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
console.log(
	`Large object allocation: ${(performance.now() - start).toFixed(2)}ms`,
);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = {
		store: null,
		params: {},
	};
}
console.log(
	`Small object allocation: ${(performance.now() - start).toFixed(2)}ms`,
);
