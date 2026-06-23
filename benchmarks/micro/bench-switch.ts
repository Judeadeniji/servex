import { bench, group, run } from "mitata";

const sanitized = "/dynamic/path/12345";
const cursor = 1;

group("String Matching", () => {
	bench("6x startsWith", () => {
		let _matched = false;
		if (sanitized.startsWith("static", cursor)) _matched = true;
		else if (sanitized.startsWith("public", cursor)) _matched = true;
		else if (sanitized.startsWith("assets", cursor)) _matched = true;
		else if (sanitized.startsWith("docs", cursor)) _matched = true;
		else if (sanitized.startsWith("contact", cursor)) _matched = true;
		else if (sanitized.startsWith("dynamic", cursor)) _matched = true;
	});

	bench("switch charCodeAt", () => {
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
	});
});

await run();
