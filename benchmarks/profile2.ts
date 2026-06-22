const ITERS = 10_000_000;
const URLS = [
	"/",
	"/api/health",
	"/api/users/42",
	"/api/posts/99/comments/1",
	"/public/css/main.css",
	"/this/does/not/exist",
];

const matchFn = new Function(
	"url",
	`
      let _s = 0, _e = url.length;
      if (url.charCodeAt(0) === 47) _s = 1;
      if (_e > _s && url.charCodeAt(_e - 1) === 47) _e -= 1;
      
      if (_s === _e) {
          return { matched: true, route: url, matched_route: "/", params: {} };
      }
      
      switch (url.charCodeAt(_s)) {
        case 97:
          if (url.charCodeAt(_s + 1) === 112 && url.charCodeAt(_s + 2) === 105) {
             // ...
             return { matched: true, params: {} };
          }
          break;
      }
      return null;
`,
);

let start = performance.now();
for (let i = 0; i < ITERS; i++) {
	for (let j = 0; j < URLS.length; j++) {
		matchFn(URLS[j]);
	}
}
console.log(`With allocation: ${(performance.now() - start).toFixed(2)}ms`);

const matchFn2 = new Function(
	"url",
	`
      let _s = 0, _e = url.length;
      if (url.charCodeAt(0) === 47) _s = 1;
      if (_e > _s && url.charCodeAt(_e - 1) === 47) _e -= 1;
      
      if (_s === _e) {
          return true;
      }
      
      switch (url.charCodeAt(_s)) {
        case 97:
          if (url.charCodeAt(_s + 1) === 112 && url.charCodeAt(_s + 2) === 105) {
             // ...
             return true;
          }
          break;
      }
      return null;
`,
);

start = performance.now();
for (let i = 0; i < ITERS; i++) {
	for (let j = 0; j < URLS.length; j++) {
		matchFn2(URLS[j]);
	}
}
console.log(`No allocation: ${(performance.now() - start).toFixed(2)}ms`);
