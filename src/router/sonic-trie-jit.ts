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
export function compileSonicTrieMatcher<_T>(
	method: HTTPMethod,
	routes: (RouteLike & { middlewares: unknown; data: unknown; path: string })[],
) {
	const trie = buildTrie(routes);

	function routeIndex(route: RouteLike): number {
		return routes.indexOf(
			route as RouteLike & {
				middlewares: unknown;
				data: unknown;
				path: string;
			},
		);
	}

	function buildReturn(
		route: RouteLike,
		capturedVars: { start: string; end: string }[],
	): string {
		const paramsObj = route.paramsKeys
			.map(
				(k, i) =>
					`${JSON.stringify(k)}: url.slice(${capturedVars[i].start}, ${capturedVars[i].end})`,
			)
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

	let idCounter = 0;

	function gen(
		node: TrieNode,
		cursorExpr: string,
		capturedVars: { start: string; end: string }[],
	): string {
		let code = "";
		const id = idCounter++;

		function compileLiteralCheck(str: string, baseCursor: string): string {
			if (str.length === 0) return "true";
			const checks = [];
			for (let i = 0; i < str.length; i++) {
				checks.push(
					`url.charCodeAt(${baseCursor} + ${i}) === ${str.charCodeAt(i)}`,
				);
			}
			return checks.join(" && ");
		}

		if (node.literal.size > 0) {
			const byFirstChar = new Map<number, { lit: string; child: TrieNode }[]>();
			for (const [lit, child] of node.literal) {
				if (lit.length === 0) continue;
				const char = lit.charCodeAt(0);
				let arr = byFirstChar.get(char);
				if (!arr) {
					arr = [];
					byFirstChar.set(char, arr);
				}
				arr.push({ lit, child });
			}

			if (byFirstChar.size === 1) {
				const [char, entries] = Array.from(byFirstChar.entries())[0];
				code += `      if (url.charCodeAt(${cursorExpr}) === ${char}) {\n`;
				for (const { lit, child } of entries) {
					const rest = lit.slice(1);
					if (rest.length > 0) {
						code += `
                if (${compileLiteralCheck(rest, `${cursorExpr} + 1`)}) {
                  const endLit${id} = ${cursorExpr} + ${lit.length};
                  const isEnd${id} = endLit${id} === _e;
                  if (isEnd${id} || url.charCodeAt(endLit${id}) === 47) {
                    if (isEnd${id}) {
                      ${child.route ? buildReturn(child.route, capturedVars) : ""}
                    } else {
                      ${gen(child, `endLit${id} + 1`, capturedVars)}
                    }
                  }
                }
              `;
					} else {
						code += `
                {
                  const endLit${id} = ${cursorExpr} + 1;
                  const isEnd${id} = endLit${id} === _e;
                  if (isEnd${id} || url.charCodeAt(endLit${id}) === 47) {
                    if (isEnd${id}) {
                      ${child.route ? buildReturn(child.route, capturedVars) : ""}
                    } else {
                      ${gen(child, `endLit${id} + 1`, capturedVars)}
                    }
                  }
                }
              `;
					}
				}
				code += `      }\n`;
			} else {
				code += `      switch (url.charCodeAt(${cursorExpr})) {\n`;
				for (const [char, entries] of byFirstChar) {
					code += `        case ${char}:\n`;
					for (const { lit, child } of entries) {
						const rest = lit.slice(1);
						if (rest.length > 0) {
							code += `
                   if (${compileLiteralCheck(rest, `${cursorExpr} + 1`)}) {
                     const endLit${id} = ${cursorExpr} + ${lit.length};
                     const isEnd${id} = endLit${id} === _e;
                     if (isEnd${id} || url.charCodeAt(endLit${id}) === 47) {
                       if (isEnd${id}) {
                         ${child.route ? buildReturn(child.route, capturedVars) : ""}
                       } else {
                         ${gen(child, `endLit${id} + 1`, capturedVars)}
                       }
                     }
                   }
                 `;
						} else {
							code += `
                   {
                     const endLit${id} = ${cursorExpr} + 1;
                     const isEnd${id} = endLit${id} === _e;
                     if (isEnd${id} || url.charCodeAt(endLit${id}) === 47) {
                       if (isEnd${id}) {
                         ${child.route ? buildReturn(child.route, capturedVars) : ""}
                       } else {
                         ${gen(child, `endLit${id} + 1`, capturedVars)}
                       }
                     }
                   }
                 `;
						}
					}
					code += `          break;\n`;
				}
				code += `      }\n`;
			}
		}

		if (node.param) {
			code += `
        {
          const n${id} = url.indexOf('/', ${cursorExpr});
          const isEndParam${id} = n${id} === -1 || n${id} >= _e;
          const endParam${id} = isEndParam${id} ? _e : n${id};
      `;
			const newCaptured = [
				...capturedVars,
				{ start: cursorExpr, end: `endParam${id}` },
			];
			code += `
          if (isEndParam${id}) {
            ${node.param.route ? buildReturn(node.param.route, newCaptured) : ""}
          } else {
            ${gen(node.param, `endParam${id} + 1`, newCaptured)}
          }
        }
      `;
		}

		if (node.wildcard) {
			const newCaptured = [...capturedVars, { start: cursorExpr, end: "_e" }];
			code += `
        ${buildReturn(node.wildcard.route, newCaptured)}
      `;
		}

		return code;
	}

	const body = gen(trie, "_s", []);

	const deps = { routes };

	const matchFn = new Function(
		"deps",
		`
    return function(url, method) {
      let _s = 0, _e = url.length;
      if (url.charCodeAt(0) === 47) _s = 1;
      if (_e > _s && url.charCodeAt(_e - 1) === 47) _e -= 1;
      
      if (_s === _e) {
        ${
          trie.literal.get("")?.route ? buildReturn(
            trie.literal.get("")?.route as RouteLike, []) : ""
        }
      }
      
      ${body}
      return null;
    };
    //# sourceURL=servex-jit/sonic-router/${method}
    `,
	)(deps);

	return { matchFn, routes: deps.routes };
}
