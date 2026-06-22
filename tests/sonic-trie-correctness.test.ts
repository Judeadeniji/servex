import { compileSonicTrieMatcher } from "../src/router/sonic-trie-jit";

type RouteLike = { path: string; paramsKeys: string[] };

function route(path: string): RouteLike {
	const paramsKeys: string[] = [];
	for (const seg of path.split("/")) {
		if (seg.startsWith(":")) paramsKeys.push(seg.slice(1));
		else if (seg.startsWith("*"))
			paramsKeys.push(seg.length > 1 ? seg.slice(1) : "path");
	}
	return { path, paramsKeys };
}

type Case = {
	desc: string;
	routes: RouteLike[];
	url: string; // sanitized (no leading/trailing slash)
	expectMatch: string | null; // expected matched_route, or null for no match
	expectParams?: Record<string, string>;
};

const cases: Case[] = [
	// ── Basic single-param ──────────────────────────────────────────────
	{
		desc: "simple single param",
		routes: [route("users/:id")],
		url: "users/42",
		expectMatch: "users/:id",
		expectParams: { id: "42" },
	},

	// ── Multi-param, correct offsets ────────────────────────────────────
	{
		desc: "multi-param, correct group-to-key mapping",
		routes: [route("posts/:postId/comments/:commentId")],
		url: "posts/99/comments/1",
		expectMatch: "posts/:postId/comments/:commentId",
		expectParams: { postId: "99", commentId: "1" },
	},

	// ── Wildcard absorbing slashes ───────────────────────────────────────
	{
		desc: "wildcard absorbs the entire remainder including slashes",
		routes: [route("public/*path")],
		url: "public/css/vendor/main.css",
		expectMatch: "public/*path",
		expectParams: { path: "css/vendor/main.css" },
	},

	// ── THE backtracking case ────────────────────────────────────────────
	// /users/active/details (literal, deeper) and /users/:id (param) both
	// branch off "users". A request for just /users/active must fall back
	// to the param route, since no route terminates at "active" alone.
	{
		desc: "backtracking: literal branch with no terminal route falls back to param",
		routes: [route("users/active/details"), route("users/:id")],
		url: "users/active",
		expectMatch: "users/:id",
		expectParams: { id: "active" },
	},
	{
		desc: "backtracking sibling: the literal route itself still matches when fully specified",
		routes: [route("users/active/details"), route("users/:id")],
		url: "users/active/details",
		expectMatch: "users/active/details",
		expectParams: {},
	},

	// ── Prefix-collision (boundary check) ────────────────────────────────
	// "users" must NOT match as a literal prefix of "userswhatever" — this
	// exercises the startsWith + boundary-character check specifically.
	{
		desc: "prefix collision: literal segment must not match a longer segment that merely starts with it",
		routes: [route("users/:id"), route("userswhatever/:id")],
		url: "userswhatever/7",
		expectMatch: "userswhatever/:id",
		expectParams: { id: "7" },
	},
	{
		desc: "prefix collision inverse: the short literal route matches its own exact segment",
		routes: [route("users/:id"), route("userswhatever/:id")],
		url: "users/7",
		expectMatch: "users/:id",
		expectParams: { id: "7" },
	},

	// ── Static-over-param-over-wildcard precedence ───────────────────────
	{
		desc: "precedence: static segment beats param at the same position",
		routes: [route("files/recent"), route("files/:name"), route("files/*rest")],
		url: "files/recent",
		expectMatch: "files/recent",
		expectParams: {},
	},
	{
		desc: "precedence: param beats wildcard at the same position",
		routes: [route("files/:name"), route("files/*rest")],
		url: "files/report.pdf",
		expectMatch: "files/:name",
		expectParams: { name: "report.pdf" },
	},
	{
		desc: "precedence: wildcard only wins when nothing more specific matches the full shape",
		routes: [route("files/:name"), route("files/*rest")],
		url: "files/a/b/c",
		expectMatch: "files/*rest",
		expectParams: { rest: "a/b/c" },
	},

	// ── Regex-special characters in literal segments ─────────────────────
	// The old regex-based matcher would have silently mistreated these as
	// regex metacharacters (unescaped interpolation). The trie matcher does
	// plain string comparison, so these must be treated literally.
	{
		desc: "literal segment with regex-special characters matches literally",
		routes: [route("api/v1.0/users"), route("api/v1.0/:id")],
		url: "api/v1.0/users",
		expectMatch: "api/v1.0/users",
		expectParams: {},
	},
	{
		desc: "regex-special literal does not accidentally match an unrelated segment via metacharacter semantics",
		routes: [route("api/v1.0/users")],
		url: "api/v1X0/users", // would match "v1.0" as a regex (.=any char) but must NOT match literally
		expectMatch: null,
	},

	// ── No match ──────────────────────────────────────────────────────────
	{
		desc: "no match returns null",
		routes: [route("users/:id")],
		url: "completely/unrelated/path",
		expectMatch: null,
	},

	// ── Duplicate/tied route shape: first registered wins ───────────────
	{
		desc: "tied route shape: first-registered route wins (matches old regex alternation semantics)",
		routes: [route("users/:id"), route("users/:userId")],
		url: "users/5",
		expectMatch: "users/:id",
		expectParams: { id: "5" },
	},
];

import { describe, expect, test } from "bun:test";

describe("compileSonicTrieMatcher Correctness", () => {
	for (const c of cases) {
		test(c.desc, () => {
			const { matchFn } = compileSonicTrieMatcher("GET", c.routes);
			const result = matchFn(c.url, `/${c.url}`, "GET");

			const gotMatch = result ? result.matched_route : null;
			expect(gotMatch).toBe(c.expectMatch);

			if (c.expectMatch !== null && c.expectParams) {
				expect(result?.params).toEqual(c.expectParams);
			}
		});
	}
});
