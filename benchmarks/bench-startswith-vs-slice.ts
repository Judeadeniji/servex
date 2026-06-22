const ITERATIONS = 1_000_000;
const sanitized = "/dynamic/path/12345";
const cursor = 1;

let start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
	let _matched = false;
	if (sanitized.startsWith("static", cursor)) _matched = true;
	else if (sanitized.startsWith("public", cursor)) _matched = true;
	else if (sanitized.startsWith("assets", cursor)) _matched = true;
	else if (sanitized.startsWith("docs", cursor)) _matched = true;
	else if (sanitized.startsWith("contact", cursor)) _matched = true;
	else if (sanitized.startsWith("dynamic", cursor)) _matched = true;
}
console.log(`6x startsWith: ${(performance.now() - start).toFixed(2)}ms`);

start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
	let _matched = false;
	const n = sanitized.indexOf("/", cursor);
	const endParam = n === -1 ? sanitized.length : n;
	const segParam = sanitized.slice(cursor, endParam);

	if (segParam === "static") _matched = true;
	else if (segParam === "public") _matched = true;
	else if (segParam === "assets") _matched = true;
	else if (segParam === "docs") _matched = true;
	else if (segParam === "contact") _matched = true;
	else if (segParam === "dynamic") _matched = true;
}
console.log(`1x slice + 6x === : ${(performance.now() - start).toFixed(2)}ms`);
