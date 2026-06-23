import { bench, group, run } from "mitata";

const sanitized = "/dynamic/path/12345";
const cursor = 1;

group("Starts With vs Slice", () => {
	bench("6x startsWith", () => {
		let _matched = false;
		if (sanitized.startsWith("static", cursor)) _matched = true;
		else if (sanitized.startsWith("public", cursor)) _matched = true;
		else if (sanitized.startsWith("assets", cursor)) _matched = true;
		else if (sanitized.startsWith("docs", cursor)) _matched = true;
		else if (sanitized.startsWith("contact", cursor)) _matched = true;
		else if (sanitized.startsWith("dynamic", cursor)) _matched = true;
	});

	bench("1x slice + 6x ===", () => {
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
	});
});

await run();
