const ITERS = 100_000_000;
const str = "hello world this is a long string";

let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = str.slice(5, 10);
}
console.log(`slice: ${(performance.now() - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	const x = str.substring(5, 10);
}
console.log(`substring: ${(performance.now() - start).toFixed(2)}ms`);
