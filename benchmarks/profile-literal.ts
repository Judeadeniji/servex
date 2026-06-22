const ITERS = 100_000_000;
const url = "/api/health/check";
const _s = 1;

let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	if (url.charCodeAt(_s) === 97) {
	}
}
console.log(`charCodeAt 1: ${(performance.now() - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	if (url.startsWith("a", _s)) {
	}
}
console.log(`startsWith 1: ${(performance.now() - start).toFixed(2)}ms`);
