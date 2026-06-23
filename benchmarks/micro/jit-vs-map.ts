import { bench, group, run } from "mitata";

const map = {
	"GET/hello": 1,
	"GET/world": 2,
	"GET/foo": 3,
	"GET/bar": 4,
};

const mapFunc = (key: string) => map[key as keyof typeof map];

const switchFunc = new Function(
	"key",
	`
  switch(key) {
    case "GET/hello": return 1;
    case "GET/world": return 2;
    case "GET/foo": return 3;
    case "GET/bar": return 4;
    default: return undefined;
  }
`,
) as (key: string) => number | undefined;

group("JIT vs Map", () => {
	bench("Map", () => {
		mapFunc("GET/foo");
	});

	bench("Switch", () => {
		switchFunc("GET/foo");
	});
});

await run();
