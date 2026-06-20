const { SonicRouter } = require("../src/router/sonic-router");

function createMockNode(path: string, paramsKeys: string[]) {
  return { path, paramsKeys, data: { handler: 1 }, middlewares: [] };
}

// Simulated regex exec approach (current SonicRouter)
const matchMaps: Record<number, ReturnType<typeof createMockNode>> = {
  1: createMockNode("/api/users/:id", ["id"]),
  3: createMockNode("/api/posts/:postId/comments/:commentId", ["postId", "commentId"])
};
const regex = /^(\/api\/users\/([^/]+))|(\/api\/posts\/([^/]+)\/comments\/([^/]+))$/;

function currentMatch(url: string) {
  const match = regex.exec(url);
  if (match) {
    for (let i = 1; i < match.length; i++) {
      const node = matchMaps[i];
      if (node && match[i] !== undefined) {
        const params: Record<string, string> = {};
        for (let k = 0; k < node.paramsKeys.length; k++) {
          params[node.paramsKeys[k]] = match[i + 1 + k];
        }
        return { node, params };
      }
    }
  }
  return null;
}

// JIT approach
const jitMatch = new Function("regex", "matchMaps", `
  return function(url) {
    // switch for static routes would go here
    const match = regex.exec(url);
    if (match) {
      if (match[1] !== undefined) {
        return { node: matchMaps[1], params: { id: match[2] } };
      }
      if (match[3] !== undefined) {
        return { node: matchMaps[3], params: { postId: match[4], commentId: match[5] } };
      }
    }
    return null;
  };
`)(regex, matchMaps);

// Warmup
for (let i = 0; i < 1000; i++) {
  currentMatch("/api/posts/123/comments/456");
  jitMatch("/api/posts/123/comments/456");
}

const iters = 10_000_000;
let start = performance.now();
for (let i = 0; i < iters; i++) {
  currentMatch("/api/posts/123/comments/456");
}
console.log("Current SonicRouter (Regex loop):", performance.now() - start, "ms");

start = performance.now();
for (let i = 0; i < iters; i++) {
  jitMatch("/api/posts/123/comments/456");
}
console.log("JIT SonicRouter (Regex unrolled):", performance.now() - start, "ms");
