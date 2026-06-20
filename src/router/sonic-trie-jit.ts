import type { HTTPMethod } from "./base";

/**
 * Minimal shape needed from a SonicRouteNode for trie building/codegen.
 * (Importing the real type from sonic-router.ts in the actual integration.)
 */
type RouteLike = {
  path: string;
  paramsKeys: string[];
};

interface TrieNode {
  literal: Map<string, TrieNode>;
  param?: TrieNode;
  wildcard?: { route: RouteLike };
  /** Set when a route's path ends exactly at this node (full segment match). */
  route?: RouteLike;
}

/**
 * Builds a trie from already specificity-sorted dynamic routes.
 *
 * Note: with a real trie, static-vs-param-vs-wildcard precedence falls out
 * of the structure itself (literal children are distinct map entries tried
 * before the single param child, which is tried before the single wildcard
 * child) — so the global compareRouteSpecificity sort isn't strictly
 * required for correctness here the way it was for the regex alternation
 * order. It's still good practice to sort before building, since it makes
 * the generated code's branch order match documented precedence exactly
 * and gives a deterministic, reviewable diff if routes are added/removed.
 */
function buildTrie(routes: RouteLike[]): TrieNode {
  const root: TrieNode = { literal: new Map() };

  for (const route of routes) {
    const segments = route.path.split("/");
    let node = root;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];

      if (seg.startsWith("*")) {
        // Wildcard is always terminal — it consumes everything remaining
        // from this point, so it doesn't need (or get) a child node.
        node.wildcard = { route };
        break;
      }

      if (seg.startsWith(":")) {
        if (!node.param) node.param = { literal: new Map() };
        node = node.param;
      } else {
        let child = node.literal.get(seg);
        if (!child) {
          child = { literal: new Map() };
          node.literal.set(seg, child);
        }
        node = child;
      }

      if (i === segments.length - 1) {
        if (!node.route) node.route = route;
      }
    }
  }

  return root;
}

/**
 * Compiles a trie into a single flat match function body (as a string, for
 * `new Function`). No regex involved — matching is done with `indexOf` /
 * `slice` segment scanning, mirroring how a hand-rolled radix matcher
 * would work, but generated per-route-set at compile time.
 *
 * CORRECTNESS-CRITICAL DESIGN NOTE — read before modifying:
 *
 * Every candidate at a given trie node (each literal child, the param
 * child, the wildcard child) is emitted as its own independent `if (...)
 * { ... }` block — never as `else if`. This is deliberate and required
 * for backtracking correctness.
 *
 * Example: routes `/users/active/details` (literal) and `/users/:id`
 * (param) both branch off the `users` node. A request for `/users/active`
 * must NOT match `/users/active/details`'s subtree (there's no route
 * ending at exactly "active" under the literal branch — only deeper at
 * "details"). Because the literal branch's generated code has nothing to
 * `return` in that case, execution falls out of that `if` block and
 * continues to the next sequential `if` block — the param branch — which
 * does have a route ending here, and returns `{ id: "active", ... }`
 * correctly.
 *
 * If literal/param/wildcard were instead chained with `else if`, this
 * fallback would never happen and `/users/active` would incorrectly
 * resolve to "no match" even though `/users/:id` should have caught it.
 * Regex alternation gets this kind of backtracking for free from the
 * engine; this hand-rolled version has to implement it explicitly via
 * "no early exclusive branching" — don't change this pattern without
 * re-verifying the cross-check test suite (see compileTrie's caller).
 */
function compileTrie(root: TrieNode, routesOut: RouteLike[]): string {
  let uid = 0;
  const nextId = () => uid++;

  function routeIndex(route: RouteLike): number {
    let idx = routesOut.indexOf(route);
    if (idx === -1) {
      routesOut.push(route);
      idx = routesOut.length - 1;
    }
    return idx;
  }

  function buildReturn(route: RouteLike, capturedVars: string[]): string {
    const paramsObj = route.paramsKeys
      .map((k, i) => `${JSON.stringify(k)}: ${capturedVars[i]}`)
      .join(",");
    const idx = routeIndex(route);
    return `return {
      matched: true,
      method: method,
      route: url,
      matched_route: ${JSON.stringify(route.path)},
      params: {${paramsObj}},
      data: deps.routes[${idx}].data,
      middlewares: deps.routes[${idx}].middlewares,
      store: deps.routes[${idx}]
    };`;
  }

  function gen(node: TrieNode, cursorExpr: string, capturedVars: string[]): string {
    const id = nextId();
    let code = ``;

    // 1. Literal children
    for (const [lit, child] of node.literal) {
      code += `
        if (sanitized.startsWith(${JSON.stringify(lit)}, ${cursorExpr})) {
          var endLit${id} = ${cursorExpr} + ${lit.length};
          var isEnd${id} = endLit${id} === sanitized.length;
          if (isEnd${id} || sanitized.charCodeAt(endLit${id}) === 47) {
            if (isEnd${id}) {
              ${child.route ? buildReturn(child.route, capturedVars) : ""}
            } else {
              ${gen(child, `endLit${id} + 1`, capturedVars)}
            }
          }
        }
      `;
    }

    // 2. Param child
    if (node.param) {
      code += `
        {
          var n${id} = sanitized.indexOf('/', ${cursorExpr});
          var isEndParam${id} = n${id} === -1;
          var endParam${id} = isEndParam${id} ? sanitized.length : n${id};
          var segParam${id} = sanitized.slice(${cursorExpr}, endParam${id});
      `;
      const newCaptured = [...capturedVars, `segParam${id}`];
      code += `
          if (isEndParam${id}) {
            ${node.param.route ? buildReturn(node.param.route, newCaptured) : ""}
          } else {
            ${gen(node.param, `n${id} + 1`, newCaptured)}
          }
        }
      `;
    }

    // 3. Wildcard child
    if (node.wildcard) {
      const newCaptured = [...capturedVars, `sanitized.slice(${cursorExpr})`];
      code += `
        ${buildReturn(node.wildcard.route, newCaptured)}
      `;
    }

    return code;
  }

  return gen(root, "0", []);
}

/**
 * Public entry point: given specificity-sorted dynamic routes for one
 * method, returns a compiled match function plus the `deps.routes` array
 * it closes over (needed by the generated `deps.routes[i]` references).
 */
export function compileSonicTrieMatcher<R extends RouteLike>(
  method: HTTPMethod,
  sortedDynamicRoutes: R[]
): { matchFn: (sanitized: string, url: string, method: string) => any; routes: R[] } {
  const routes: R[] = [];
  const trie = buildTrie(sortedDynamicRoutes);
  const body = compileTrie(trie, routes);

  const deps = { routes };

  const matchFn = new Function(
    "deps",
    `
    return function(sanitized, url, method) {
      ${body}
      return null;
    };
    //# sourceURL=servex-jit/sonic-router/${method}
    `
  )(deps);

  return { matchFn, routes: deps.routes };
}
