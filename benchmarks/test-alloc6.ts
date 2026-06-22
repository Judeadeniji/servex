const ITERS = 100_000_000;

class RouteMatch {
	constructor(
		public matched: boolean,
		public store: any,
		public params: any,
	) {}
	get method() {
		return "GET";
	}
	get route() {
		return "/api/health";
	}
	get matched_route() {
		return "/api/health";
	}
	get data() {
		return "ok";
	}
	get middlewares() {
		return [];
	}
}

const start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = new RouteMatch(true, null, {});
}
console.log(`Class with 3 props: ${(performance.now() - start).toFixed(2)}ms`);
