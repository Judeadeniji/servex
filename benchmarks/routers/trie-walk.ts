import { bench, run } from "mitata";
import {
    compareRouteSpecificity,
    type SonicRouteNode,
} from "../../src/router/sonic-router";
import type { InternalHandler } from "../../src/types";

class TrieNode {
	staticChildren: Record<string, TrieNode> = {};
	paramChild: TrieNode | null = null;
	wildcardChild: TrieNode | null = null;
	route: SonicRouteNode | null = null;
	paramMap: Record<string, number> = {};
}

function generateReturn(
	route: SonicRouteNode,
	paramMap: Record<string, number>,
	compiledRoutes: SonicRouteNode[],
) {
	const routeIdx = compiledRoutes.push(route) - 1;
	let paramsCode = ``;
	if (Object.keys(paramMap).length > 0) {
		paramsCode += `const params = {};\n`;
		for (const [pName, depth] of Object.entries(paramMap)) {
			paramsCode += `params[${JSON.stringify(pName)}] = p${depth};\n`;
		}
	} else {
		paramsCode += `const params = {};\n`;
	}
	return `
        ${paramsCode}
        return {
            matched: true,
            method: method,
            route: url,
            matched_route: ${JSON.stringify(route.path)},
            params: params,
            handlers: deps.routes[${routeIdx}].data,
            middlewares: deps.routes[${routeIdx}].middlewares,
            store: deps.routes[${routeIdx}]
        };
    `;
}

function generateNodeCode(
	node: TrieNode,
	depth: number,
	pathStartExpr: string,
	compiledRoutes: SonicRouteNode[],
): string {
	let code = "";
	const needsSegment =
		Object.keys(node.staticChildren).length > 0 || node.paramChild;

	if (needsSegment) {
		if (depth === 0) {
			code += `
                let nextIdx_0 = path.indexOf('/', 0);
                let isLast_0 = nextIdx_0 === -1;
                let seg_0 = isLast_0 ? path : path.slice(0, nextIdx_0);
            `;
		} else {
			code += `
                let nextIdx_${depth} = path.indexOf('/', ${pathStartExpr});
                let isLast_${depth} = nextIdx_${depth} === -1;
                let seg_${depth} = isLast_${depth} ? path.slice(${pathStartExpr}) : path.slice(${pathStartExpr}, nextIdx_${depth});
            `;
		}
	}

	for (const [seg, child] of Object.entries(node.staticChildren)) {
		code += `if (seg_${depth} === ${JSON.stringify(seg)}) {\n`;
		if (child.route) {
			code += `  if (isLast_${depth}) {\n`;
			code += `    ${generateReturn(child.route, child.paramMap, compiledRoutes)}\n`;
			code += `  }\n`;
		}
		const hasChildren =
			Object.keys(child.staticChildren).length > 0 ||
			child.paramChild ||
			child.wildcardChild;
		if (hasChildren) {
			code += `  if (!isLast_${depth}) {\n`;
			code += generateNodeCode(
				child,
				depth + 1,
				`nextIdx_${depth} + 1`,
				compiledRoutes,
			);
			code += `  }\n`;
		}
		code += `}\n`;
	}

	if (node.paramChild) {
		const child = node.paramChild;
		code += `p${depth} = seg_${depth};\n`;
		if (child.route) {
			code += `if (isLast_${depth}) {\n`;
			code += `  ${generateReturn(child.route, child.paramMap, compiledRoutes)}\n`;
			code += `}\n`;
		}
		const hasChildren =
			Object.keys(child.staticChildren).length > 0 ||
			child.paramChild ||
			child.wildcardChild;
		if (hasChildren) {
			code += `if (!isLast_${depth}) {\n`;
			code += generateNodeCode(
				child,
				depth + 1,
				`nextIdx_${depth} + 1`,
				compiledRoutes,
			);
			code += `}\n`;
		}
	}

	if (node.wildcardChild) {
		const child = node.wildcardChild;
		if (child.route) {
			if (depth === 0) {
				code += `p0 = path;\n`;
				code += generateReturn(child.route, child.paramMap, compiledRoutes);
			} else {
				code += `p${depth} = path.slice(${pathStartExpr});\n`;
				code += generateReturn(child.route, child.paramMap, compiledRoutes);
			}
		}
	}

	return code;
}

export function compileTrie(routes: SonicRouteNode[]) {
	const sorted = routes.slice().sort(compareRouteSpecificity);
	const compiledRoutes: SonicRouteNode[] = [];
	const root = new TrieNode();

	for (let i = 0; i < sorted.length; i++) {
		const route = sorted[i];
		const segments = route.path === "" ? [""] : route.path.split("/");
		let curr = root;
		const pMap: Record<string, number> = {};

		for (let depth = 0; depth < segments.length; depth++) {
			const seg = segments[depth];
			if (seg.startsWith(":")) {
				const pName = seg.slice(1);
				if (!curr.paramChild) curr.paramChild = new TrieNode();
				curr = curr.paramChild;
				pMap[pName] = depth;
			} else if (seg.startsWith("*")) {
				const pName = seg.length > 1 ? seg.slice(1) : "path";
				if (!curr.wildcardChild) curr.wildcardChild = new TrieNode();
				curr = curr.wildcardChild;
				pMap[pName] = depth;
				break;
			} else {
				if (!curr.staticChildren[seg])
					curr.staticChildren[seg] = new TrieNode();
				curr = curr.staticChildren[seg];
			}
		}
		if (!curr.route) {
			curr.route = route;
			curr.paramMap = pMap;
		}
	}

	let code = `let p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18, p19;\n`;
	code += generateNodeCode(root, 0, "0", compiledRoutes);

	const deps = { routes: compiledRoutes };

	const fnStr = `
      return function(path, url, method) {
        const sanitized = path;
        ${code}
        return null;
      };
    `;
	// console.log("--- GENERATED CODE ---\n", fnStr);

	return new Function("deps", fnStr)(deps);
}

// === Benchmark ===
const dynamicRoutes: SonicRouteNode[] = [
	{
		method: "GET",
		path: "/api/users/:id",
		handlers: [
			"param",
		] as unknown as InternalHandler[],
		paramsKeys: ["id"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/api/posts/:id",
		handlers: [
			"param",
		] as unknown as InternalHandler[],
		paramsKeys: ["id"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/api/products/:sku",
		handlers: [
			"param",
		] as unknown as InternalHandler[],
		paramsKeys: ["sku"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/u/:username",
		handlers: [
			"param",
		] as unknown as InternalHandler[],
		paramsKeys: ["username"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/events/:eventId",
		handlers: [
			"param",
		] as unknown as InternalHandler[],
		paramsKeys: ["eventId"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/api/posts/:id/comments/:commentId",
		handlers: [
			"param-n",
		] as unknown as InternalHandler[],
		paramsKeys: ["id", "commentId"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/repo/:owner/:repo",
		handlers: [
			"param-n",
		] as unknown as InternalHandler[],
		paramsKeys: ["owner", "repo"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/repo/:owner/:repo/issues/:issueId",
		handlers: [
			"param-n",
		] as unknown as InternalHandler[],
		paramsKeys: ["owner", "repo", "issueId"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/store/:country/:state",
		handlers: [
			"param-n",
		] as unknown as InternalHandler[],
		paramsKeys: ["country", "state"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/flights/:origin/:dest/:date",
		handlers: [
			"param-n",
		] as unknown as InternalHandler[],
		paramsKeys: ["origin", "dest", "date"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/public/*path",
		handlers: [
			"wild",
		] as unknown as InternalHandler[],
		paramsKeys: ["path"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/assets/*path",
		handlers: [
			"wild",
		] as unknown as InternalHandler[],
		paramsKeys: ["path"],
		middlewares: [],
	},
	{
		method: "GET",
		path: "/api/legacy/*path",
		handlers: [
			"wild",
		] as unknown as InternalHandler[],
		paramsKeys: ["path"],
		middlewares: [],
	},
];

const matchFn = compileTrie(dynamicRoutes);

const URLS = [
	"api/users/42",
	"api/posts/hello-world",
	"u/johndoe",
	"events/evt-2026-06",
	"api/products/SKU-999",
	"api/posts/99/comments/1",
	"repo/microsoft/vscode",
	"flights/JFK/LAX/2026-12-01",
	"public/css/main.css",
	"this/does/not/exist",
];

// Sanity checks
for (const u of URLS) {
	const r = matchFn(u, `/${u}`, "GET");
	console.log(u, "=>", r ? r.matched_route : "null");
}

bench("TrieWalk", () => {
	for (const url of URLS) matchFn(url, `/${url}`, "GET");
});

await run();
