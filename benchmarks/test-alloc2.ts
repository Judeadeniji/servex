const ITERS = 100_000_000;

class Result {
	constructor(
		public matched: boolean,
		public method: string,
		public route: string,
		public matched_route: string,
		public params: any,
		public data: any,
		public middlewares: any,
		public store: any,
	) {}
}

let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = new Result(
		true,
		"GET",
		"/api/health",
		"/api/health",
		{},
		"ok",
		[],
		null,
	);
}
console.log(`Class allocation: ${(performance.now() - start).toFixed(2)}ms`);

start = performance.now();
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
	`Large literal allocation: ${(performance.now() - start).toFixed(2)}ms`,
);
