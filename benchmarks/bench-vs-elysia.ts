/**
 * ServeX vs Elysia HTTP benchmark
 *
 * Methodology:
 *   - Real HTTP over a socket (autocannon -> Bun.serve), not in-process calls.
 *     This matters because Elysia's edge includes Bun HTTP layer integration,
 *     which an in-process microbenchmark would hide.
 *   - Realistic request mix: static, single-param, multi-param, wildcard, 404.
 *     Single hot-route benchmarks are best-case for everything and tell you
 *     nothing about real apps (learned the hard way — see docs/jit-performance-work.md).
 *   - 3 rounds per framework, median taken. Single-run numbers are noise.
 *   - Sequential, not concurrent — avoids resource contention skewing one side.
 *   - No validation, no schema, minimal handlers on both sides.
 *
 * Usage:
 *   bun benchmarks/bench-vs-elysia.ts [--duration 10] [--connections 50]
 *
 * Options:
 *   --duration     Seconds per autocannon run (default: 10)
 *   --connections  Concurrent HTTP connections (default: 50)
 *   --rounds       Runs per framework, median taken (default: 3)
 *   --pipelining   HTTP pipelining factor (default: 1)
 */

import * as path from "node:path";
import autocannon, { type Result } from "autocannon";
import { type Subprocess, spawn } from "bun";

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string, def: number) => {
	const i = args.indexOf(flag);
	return i !== -1 ? Number(args[i + 1]) : def;
};
const DURATION = getArg("--duration", 10);
const CONNECTIONS = 200;
const ROUNDS = getArg("--rounds", 3);
const PIPELINING = getArg("--pipelining", 1);

// ── Request mix ─────────────────────────────────────────────────────────────
// Covers all route categories: static, single-param, multi-param, wildcard, 404.
// Realistic traffic distribution: static routes tend to be the most-hit,
// followed by single-param, then deep/wildcard, with occasional 404s.
const REQUEST_MIX: Array<{ path: string; category: string }> = [
	// Static (5 of 15 — ~33%)
	{ path: "/", category: "static" },
	{ path: "/api/health", category: "static" },
	{ path: "/dashboard", category: "static" },
	{ path: "/docs", category: "static" },
	{ path: "/contact", category: "static" },

	// Single param (5 of 15 — ~33%)
	{ path: "/api/users/42", category: "param-1" },
	{ path: "/api/posts/hello-world", category: "param-1" },
	{ path: "/u/johndoe", category: "param-1" },
	{ path: "/events/evt-2026-06", category: "param-1" },
	{ path: "/api/products/SKU-999", category: "param-1" },

	// Multi-param (3 of 15 — 20%)
	{ path: "/api/posts/99/comments/1", category: "param-n" },
	{ path: "/repo/microsoft/vscode", category: "param-n" },
	{ path: "/flights/JFK/LAX/2026-12-01", category: "param-n" },

	// Wildcard (1 of 15 — ~7%)
	{ path: "/public/css/main.css", category: "wildcard" },

	// 404 (1 of 15 — ~7%)
	{ path: "/this/does/not/exist", category: "404" },
];

// ── Types ────────────────────────────────────────────────────────────────────
interface RoundResult {
	rps: number; // requests/sec
	p50: number; // ms
	p99: number; // ms
	p999: number; // ms
	errors: number;
}

interface Summary {
	name: string;
	rounds: RoundResult[];
	median: RoundResult;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function median(values: number[]): number {
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function sleep(ms: number) {
	return new Promise<void>((r) => setTimeout(r, ms));
}

function runAutocannon(url: string): Promise<Result> {
	return new Promise((resolve, reject) => {
		autocannon(
			{
				url,
				connections: CONNECTIONS,
				duration: DURATION,
				pipelining: PIPELINING,
				requests: REQUEST_MIX.map(({ path }) => ({ path, method: "GET" })),
			},
			(err, result) => {
				if (err) reject(err);
				else resolve(result);
			},
		);
	});
}

function parseResult(r: Result): RoundResult {
	return {
		rps: Math.round(r.requests.average),
		p50: r.latency.p50,
		p99: r.latency.p99,
		p999: r.latency.p99_9 ?? r.latency.p99,
		errors: (r.errors ?? 0) + (r.timeouts ?? 0),
	};
}

function medianRound(rounds: RoundResult[]): RoundResult {
	return {
		rps: Math.round(median(rounds.map((r) => r.rps))),
		p50: median(rounds.map((r) => r.p50)),
		p99: median(rounds.map((r) => r.p99)),
		p999: median(rounds.map((r) => r.p999)),
		errors: Math.round(median(rounds.map((r) => r.errors))),
	};
}

async function startServer(
	script: string,
	port: number,
	label: string,
): Promise<Subprocess> {
	const proc = spawn(["bun", script], {
		env: { ...process.env, PORT: String(port) },
		stdout: "pipe",
		stderr: "pipe",
	});

	// Wait until the server signals it's ready, or timeout after 5s
	const deadline = Date.now() + 5000;
	let started = false;

	const reader = proc.stdout.getReader();
	const readLoop = async () => {
		while (Date.now() < deadline) {
			const { value, done } = await reader.read();
			if (done) break;
			const text = new TextDecoder().decode(value);
			if (text.includes("listening")) {
				started = true;
				break;
			}
		}
	};

	await Promise.race([readLoop(), sleep(5000)]);

	if (!started) {
		// Still give it a moment — some runtimes print after setup
		await sleep(500);
		// Do a quick probe
		try {
			const probe = await fetch(`http://localhost:${port}/api/health`);
			if (probe.ok) started = true;
		} catch {
			/* not ready yet */
		}
	}

	if (!started) {
		proc.kill();
		throw new Error(`[${label}] server did not start within 5s on :${port}`);
	}

	console.log(`  ✓ ${label} ready on :${port}`);
	return proc;
}

async function benchFramework(
	name: string,
	script: string,
	port: number,
): Promise<Summary> {
	console.log(`\n${"─".repeat(60)}`);
	console.log(`  Starting ${name} on :${port}...`);

	const proc = await startServer(script, port, name);

	// Brief warmup (not counted) — primes V8 JIT and Bun's connection pool
	console.log(`  Warming up...`);
	await runAutocannon(`http://localhost:${port}`);
	await sleep(200);

	const rounds: RoundResult[] = [];
	for (let i = 1; i <= ROUNDS; i++) {
		process.stdout.write(`  Round ${i}/${ROUNDS}... `);
		const result = await runAutocannon(`http://localhost:${port}`);
		const parsed = parseResult(result);
		rounds.push(parsed);
		console.log(
			`${parsed.rps.toLocaleString()} req/s  p50=${parsed.p50}ms  p99=${parsed.p99}ms`,
		);
		await sleep(300); // cooldown between rounds
	}

	proc.kill();
	await sleep(300); // let the port release

	return { name, rounds, median: medianRound(rounds) };
}

function printTable(a: Summary, b: Summary) {
	const fmt = (n: number, unit = "") => String(n.toLocaleString()) + unit;
	const ratio = (av: number, bv: number) => {
		const r = av / bv;
		const arrow = r >= 1 ? "▲" : "▼";
		return `${arrow} ${Math.abs((r - 1) * 100).toFixed(1)}%`;
	};

	const col = 22;
	const pad = (s: string, w: number) => s.padStart(w);
	const line = "─".repeat(col * 3 + 2);

	console.log(`\n${"═".repeat(col * 3 + 2)}`);
	console.log(
		` RESULTS  (${ROUNDS} rounds, median)  —  ${CONNECTIONS} connections, ${DURATION}s per run`,
	);
	console.log(`${"═".repeat(col * 3 + 2)}`);
	console.log(`${pad("", col)} ${pad(a.name, col)} ${pad(b.name, col)}`);
	console.log(line);

	const rows: Array<[string, string, string, string]> = [
		[
			"Requests/sec",
			fmt(a.median.rps),
			fmt(b.median.rps),
			ratio(a.median.rps, b.median.rps),
		],
		[
			"Latency p50 (ms)",
			fmt(a.median.p50, "ms"),
			fmt(b.median.p50, "ms"),
			ratio(b.median.p50, a.median.p50),
		], // lower is better, flip ratio
		[
			"Latency p99 (ms)",
			fmt(a.median.p99, "ms"),
			fmt(b.median.p99, "ms"),
			ratio(b.median.p99, a.median.p99),
		],
		[
			"Latency p999 (ms)",
			fmt(a.median.p999, "ms"),
			fmt(b.median.p999, "ms"),
			ratio(b.median.p999, a.median.p999),
		],
		[
			"Errors (median)",
			fmt(a.median.errors),
			fmt(b.median.errors),
			a.median.errors === 0 && b.median.errors === 0 ? "✓ both clean" : "",
		],
	];

	for (const [label, av, bv, diff] of rows) {
		console.log(`${pad(label, col)} ${pad(av, col)} ${pad(bv, col)}  ${diff}`);
	}

	console.log(line);
	console.log(`\n  Ratio column shows ${a.name} relative to ${b.name}.`);
	console.log(`  ▲ = ${a.name} wins, ▼ = ${b.name} wins.`);
	console.log(
		`  For latency: ratio is inverted (lower latency = win), so ▲ = lower latency.\n`,
	);

	// Per-round detail
	console.log(`  Per-round req/s:`);
	for (let i = 0; i < ROUNDS; i++) {
		const ar = a.rounds[i];
		const br = b.rounds[i];
		if (!ar || !br) continue;
		console.log(
			`    Round ${i + 1}:` +
				`  ${a.name} ${ar.rps.toLocaleString()} req/s` +
				`  |  ${b.name} ${br.rps.toLocaleString()} req/s`,
		);
	}
}

// ── Main ─────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(import.meta.dir, "..");

async function main() {
	console.log("ServeX vs Elysia — HTTP Benchmark");
	console.log(
		`Config: ${CONNECTIONS} connections, ${DURATION}s/run, ${ROUNDS} rounds, pipelining=${PIPELINING}`,
	);
	console.log(
		`Request mix: ${REQUEST_MIX.length} URLs (${[...new Set(REQUEST_MIX.map((r) => r.category))].join(", ")})`,
	);

	const servexSummary = await benchFramework(
		"ServeX",
		path.join(ROOT, "benchmarks/servers/servex-server.ts"),
		3000,
	);

	const elysiaSummary = await benchFramework(
		"Elysia",
		path.join(ROOT, "benchmarks/servers/elysia-server.ts"),
		3001,
	);

	const servexSummaryRegex = await benchFramework(
		"ServeX (Regex)",
		path.join(ROOT, "benchmarks/servers/servex-server-regex.ts"),
		3002,
	);

	printTable(servexSummary, servexSummaryRegex);
	printTable(servexSummary, elysiaSummary);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
