import * as fs from "node:fs";
import * as path from "node:path";
import autocannon, { type Result } from "autocannon";
import { type Subprocess, spawn } from "bun";

// ── CLI args ────────────────────────────────────────────────────────────────
const DURATION = 5;
const CONNECTIONS = 50;
const ROUNDS = 3;

// ── Servers code ────────────────────────────────────────────────────────────
const SERVO_CODE = `
import { createServer } from "../../src/index";
import { RouterType } from "../../src/router/adapter";
const app = createServer({ router: { type: RouterType.SONIC as any } });
app.get("/", () => new Response("ok"));
Bun.serve({ port: 3000, fetch: app.fetch });
console.log("[servex] listening on :3000");
`;

const ELYSIA_CODE = `
import { Elysia } from "elysia";
new Elysia().get("/", () => "ok").listen(3001);
console.log("[elysia] listening on :3001");
`;

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
			},
			(err, result) => {
				if (err) reject(err);
				else resolve(result);
			},
		);
	});
}

async function startServer(
	scriptPath: string,
	_port: number,
	label: string,
): Promise<Subprocess> {
	const proc = spawn(["bun", scriptPath], { stdout: "pipe", stderr: "pipe" });
	let started = false;
	const deadline = Date.now() + 5000;
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
		proc.kill();
		throw new Error(`[${label}] server did not start within 5s`);
	}
	return proc;
}

async function bench(name: string, scriptPath: string, port: number) {
	const proc = await startServer(scriptPath, port, name);
	await runAutocannon(`http://localhost:${port}`); // warmup
	const rps: number[] = [];
	for (let i = 0; i < ROUNDS; i++) {
		const res = await runAutocannon(`http://localhost:${port}`);
		rps.push(res.requests.average);
	}
	proc.kill();
	await sleep(300);
	return median(rps);
}

async function main() {
	fs.writeFileSync(
		path.join(__dirname, "servers", "servex-single.ts"),
		SERVO_CODE,
	);
	fs.writeFileSync(
		path.join(__dirname, "servers", "elysia-single.ts"),
		ELYSIA_CODE,
	);

	console.log("=== ZERO MIDDLEWARE SINGLE ROUTE ===");
	const servex = await bench(
		"ServeX",
		path.join(__dirname, "servers", "servex-single.ts"),
		3000,
	);
	const elysia = await bench(
		"Elysia",
		path.join(__dirname, "servers", "elysia-single.ts"),
		3001,
	);

	console.log(`ServeX: ${Math.round(servex).toLocaleString()} req/s`);
	console.log(`Elysia: ${Math.round(elysia).toLocaleString()} req/s`);
	const ratio = servex / elysia;
	console.log(`ServeX is ${(ratio * 100).toFixed(1)}% of Elysia speed.`);
}

main().catch(console.error);
