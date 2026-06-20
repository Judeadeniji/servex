const iters = 10_000_000;
const map = {
  "GET/hello": 1,
  "GET/world": 2,
  "GET/foo": 3,
  "GET/bar": 4,
};

const mapFunc = (key: string) => map[key as keyof typeof map];

const switchFunc = new Function("key", `
  switch(key) {
    case "GET/hello": return 1;
    case "GET/world": return 2;
    case "GET/foo": return 3;
    case "GET/bar": return 4;
    default: return undefined;
  }
`) as (key: string) => number | undefined;

// Warmup
for (let i=0; i<1000; i++) {
  mapFunc("GET/foo");
  switchFunc("GET/foo");
}

let start = performance.now();
let sum1 = 0;
for (let i = 0; i < iters; i++) {
  sum1 += mapFunc("GET/foo")!;
}
console.log("Map:", performance.now() - start);

start = performance.now();
let sum2 = 0;
for (let i = 0; i < iters; i++) {
  sum2 += switchFunc("GET/foo")!;
}
console.log("Switch:", performance.now() - start);
