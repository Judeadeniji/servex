const ITERATIONS = 10_000_000;
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
	switch (sanitized.charCodeAt(cursor)) {
		case 115: // s
			if (sanitized.startsWith("tatic", cursor + 1)) _matched = true;
			break;
		case 112: // p
			if (sanitized.startsWith("ublic", cursor + 1)) _matched = true;
			break;
		case 97: // a
			if (sanitized.startsWith("ssets", cursor + 1)) _matched = true;
			break;
		case 100: // d
			if (sanitized.charCodeAt(cursor + 1) === 111) {
				// do
				if (sanitized.startsWith("cs", cursor + 2)) _matched = true;
			} else if (sanitized.charCodeAt(cursor + 1) === 121) {
				// dy
				if (sanitized.startsWith("namic", cursor + 2)) _matched = true;
			}
			break;
		case 99: // c
			if (sanitized.startsWith("ontact", cursor + 1)) _matched = true;
			break;
	}
}
console.log(`switch charCodeAt: ${(performance.now() - start).toFixed(2)}ms`);
