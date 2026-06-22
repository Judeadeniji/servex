const ITERS = 100_000_000;

let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = [null, {}];
}
console.log(`Array allocation: ${(performance.now() - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = { store: null, params: {} };
}
console.log(`Small object: ${(performance.now() - start).toFixed(2)}ms`);
