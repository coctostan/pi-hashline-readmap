#!/usr/bin/env node
/**
 * Local macOS runner for the Explicit Edit benchmark tasks
 * (https://github.com/alexshpunt/explicit-edit-benchmark, MIT).
 *
 * Uses the benchmark's own deterministic task generator and byte-exact expected trees, and runs
 * each task through headless Pi (`pi -p --mode json`) with one "arm" loaded:
 *
 *   pi-default   Pi's built-in tools only
 *   working      this checkout's index.ts
 *   ref:<git>    a git-archive snapshot of <git> (e.g. ref:HEAD, ref:main)
 *
 * There is no Bubblewrap sandbox, so results are for comparing arms locally and are not
 * publishable to the benchmark's dataset. Every arm runs the same tasks with the same model.
 *
 * Usage:
 *   node scripts/bench/explicit-edit.mjs --model anthropic-cc/claude-haiku-4-5 --sample 2
 *   node scripts/bench/explicit-edit.mjs --model ollama/qwen3:4b --arms ref:HEAD,working --tasks unique-10-plain
 *
 * Options:
 *   --model P/ID         Pi model (required). `ollama/...` loads scripts/bench/ollama-provider.ts;
 *                        `anthropic-cc/...` loads the pi-claude-header extension (see --provider-extension).
 *   --arms LIST          Comma-separated arms (default: pi-default,ref:HEAD,working)
 *   --sample N           N tasks per task family, deterministic hash order (default: 2). Ignored with --tasks/--all.
 *   --tasks IDS          Comma-separated task ids
 *   --all                All 226 tasks
 *   --repeat N           Run every (arm, task) N times (default: 1)
 *   --concurrency N      Parallel Pi processes (default: 2)
 *   --timeout S          Seconds per run (default: 300)
 *   --thinking LEVEL     Pi thinking level (default: off)
 *   --out DIR            Results directory (default: tmp/bench-results/<timestamp>)
 *   --resume             Skip runs already recorded in DIR/results.jsonl
 *   --provider-extension PATH   Extra extension that provides the model (repeatable)
 *   --bench-dir DIR      Benchmark checkout (default: tmp/explicit-edit-benchmark, cloned if missing)
 *   --list               Print the selected task ids and exit
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, appendFileSync, lstatSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createJiti } from "jiti";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BENCH_REPO_URL = "https://github.com/alexshpunt/explicit-edit-benchmark.git";
const BENCH_COMMIT = "4e11e95ccec7fd156f36755093f592d80d487224";
const DEFAULT_CLAUDE_HEADER = resolve(REPO, "../pi-claude-header/src/index.ts");

// ─── Arguments ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
	const opts = {
		arms: ["pi-default", "ref:HEAD", "working"],
		sample: 2,
		repeat: 1,
		concurrency: 2,
		timeout: 300,
		thinking: "off",
		providerExtensions: [],
		benchDir: resolve(REPO, "tmp/explicit-edit-benchmark"),
	};
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = () => {
			const next = argv[++i];
			if (next === undefined) throw new Error(`Missing value for ${flag}`);
			return next;
		};
		switch (flag) {
			case "--model": opts.model = value(); break;
			case "--arms": opts.arms = value().split(",").map((s) => s.trim()).filter(Boolean); break;
			case "--sample": opts.sample = Number(value()); break;
			case "--tasks": opts.tasks = value().split(",").map((s) => s.trim()).filter(Boolean); break;
			case "--all": opts.all = true; break;
			case "--repeat": opts.repeat = Number(value()); break;
			case "--concurrency": opts.concurrency = Number(value()); break;
			case "--timeout": opts.timeout = Number(value()); break;
			case "--thinking": opts.thinking = value(); break;
			case "--out": opts.out = resolve(value()); break;
			case "--resume": opts.resume = true; break;
			case "--provider-extension": opts.providerExtensions.push(resolve(value())); break;
			case "--bench-dir": opts.benchDir = resolve(value()); break;
			case "--list": opts.list = true; break;
			case "--help": case "-h":
				console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
				process.exit(0);
			default: throw new Error(`Unknown option: ${flag}`);
		}
	}
	if (!opts.model && !opts.list) throw new Error("--model is required (e.g. anthropic-cc/claude-haiku-4-5 or ollama/qwen3:4b)");
	opts.out ??= resolve(REPO, "tmp/bench-results", new Date().toISOString().replace(/[:.]/g, "-"));
	return opts;
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

function ensureBenchCheckout(dir) {
	if (!existsSync(join(dir, "src/suites/explicit-edit/fixtures.ts"))) {
		console.error(`Cloning Explicit Edit benchmark into ${dir} ...`);
		mkdirSync(dirname(dir), { recursive: true });
		execFileSync("git", ["clone", "--quiet", BENCH_REPO_URL, dir], { stdio: "inherit" });
		execFileSync("git", ["-C", dir, "checkout", "--quiet", BENCH_COMMIT], { stdio: "inherit" });
	}
	const head = execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
	return head;
}

async function loadTasks(benchDir) {
	const jiti = createJiti(import.meta.url, { moduleCache: false });
	const mod = await jiti.import(join(benchDir, "src/suites/explicit-edit/fixtures.ts"));
	return mod.explicitEditTasks();
}

function taskFamily(id) {
	return id.replace(/-\d.*$/, "");
}

function selectTasks(all, opts) {
	if (opts.tasks) {
		const byId = new Map(all.map((task) => [task.id, task]));
		return opts.tasks.map((id) => {
			const task = byId.get(id);
			if (!task) throw new Error(`Unknown task id: ${id}`);
			return task;
		});
	}
	if (opts.all) return all;
	const families = new Map();
	for (const task of all) {
		const family = taskFamily(task.id);
		if (!families.has(family)) families.set(family, []);
		families.get(family).push(task);
	}
	// Deterministic but spread out: order each family by a hash of the task id, so a small sample
	// mixes scales (10/100/1000), languages, and plain/unicode variants instead of one slice.
	const rank = (id) => createHash("sha256").update(id).digest("hex");
	const picked = [];
	for (const tasks of families.values()) {
		const ordered = [...tasks].sort((a, b) => (rank(a.id) < rank(b.id) ? -1 : 1));
		picked.push(...ordered.slice(0, Math.min(opts.sample, ordered.length)));
	}
	return picked;
}

// ─── Arms ───────────────────────────────────────────────────────────────────

function snapshotRef(ref) {
	const sha = execFileSync("git", ["-C", REPO, "rev-parse", ref], { encoding: "utf8" }).trim();
	const dir = resolve(REPO, "tmp/bench-arms", sha.slice(0, 12));
	if (!existsSync(join(dir, "index.ts"))) {
		mkdirSync(dir, { recursive: true });
		const archive = execFileSync("git", ["-C", REPO, "archive", sha], { maxBuffer: 512 * 1024 * 1024 });
		execFileSync("tar", ["-x", "-C", dir], { input: archive });
	}
	if (!existsSync(join(dir, "node_modules"))) symlinkSync(resolve(REPO, "node_modules"), join(dir, "node_modules"));
	return { entry: join(dir, "index.ts"), version: sha.slice(0, 12) };
}

function resolveArm(name) {
	if (name === "pi-default") return { name, extensions: [], version: "builtin" };
	if (name === "working") {
		const dirty = execFileSync("git", ["-C", REPO, "status", "--porcelain"], { encoding: "utf8" }).trim() ? "+dirty" : "";
		const sha = execFileSync("git", ["-C", REPO, "rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim();
		return { name, extensions: [resolve(REPO, "index.ts")], version: sha + dirty };
	}
	if (name.startsWith("ref:")) {
		const snap = snapshotRef(name.slice(4));
		return { name, extensions: [snap.entry], version: snap.version };
	}
	throw new Error(`Unknown arm: ${name} (use pi-default, working, or ref:<git-ref>)`);
}

function providerExtensions(model, explicit) {
	if (explicit.length) return explicit;
	const provider = model.split("/")[0];
	if (provider === "ollama") return [resolve(REPO, "scripts/bench/ollama-provider.ts")];
	if (provider === "anthropic-cc") {
		if (!existsSync(DEFAULT_CLAUDE_HEADER)) throw new Error(`anthropic-cc needs --provider-extension (not found: ${DEFAULT_CLAUDE_HEADER})`);
		return [DEFAULT_CLAUDE_HEADER];
	}
	return [];
}

// ─── Workspace and verification ────────────────────────────────────────────

function toBytes(value) {
	if (typeof value === "string") return Buffer.from(value, "utf8");
	if (value instanceof Uint8Array) return Buffer.from(value);
	throw new Error(`Unsupported fixture value type: ${typeof value}`);
}

function writeTree(root, files) {
	for (const [path, value] of Object.entries(files)) {
		const target = join(root, path);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, toBytes(value));
	}
}

function readTree(root) {
	const out = new Map();
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			const stat = lstatSync(full);
			const rel = relative(root, full).split("\\").join("/");
			if (stat.isSymbolicLink()) out.set(rel, null);
			else if (stat.isDirectory()) walk(full);
			else out.set(rel, readFileSync(full));
		}
	};
	walk(root);
	return out;
}

/** Byte-exact comparison of the whole tree. Returns a list of differences (empty = pass). */
function verifyTree(root, expected) {
	const actual = readTree(root);
	const diffs = [];
	for (const [path, value] of Object.entries(expected)) {
		const want = toBytes(value);
		const got = actual.get(path);
		if (got === undefined) diffs.push(`missing ${path}`);
		else if (got === null) diffs.push(`symlink ${path}`);
		else if (!got.equals(want)) diffs.push(`changed ${path}${describeByteDiff(got, want)}`);
		actual.delete(path);
	}
	for (const path of actual.keys()) diffs.push(`extra ${path}`);
	return diffs;
}

function describeByteDiff(got, want) {
	let i = 0;
	while (i < got.length && i < want.length && got[i] === want[i]) i++;
	const line = want.subarray(0, i).toString("utf8").split("\n").length;
	const eofOnly = got.toString("utf8").replace(/(\r?\n)+$/, "") === want.toString("utf8").replace(/(\r?\n)+$/, "");
	return ` (first difference at line ${line}${eofOnly ? ", trailing newline only" : ""})`;
}

// ─── Pi execution ───────────────────────────────────────────────────────────

function runPi({ cwd, prompt, model, thinking, extensions, timeoutMs }) {
	const args = [
		"-p", "--mode", "json", "--no-session",
		"--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes", "--offline",
		...extensions.flatMap((path) => ["-e", path]),
		"--model", model, "--thinking", thinking,
		"--", prompt,
	];
	return new Promise((resolvePromise) => {
		const started = Date.now();
		// stdin must be closed: headless Pi otherwise waits for piped input.
		const child = spawn("pi", args, { cwd, env: { ...process.env, PI_OFFLINE: "1" }, detached: true, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		child.stdout.on("data", (d) => (stdout += d));
		child.stderr.on("data", (d) => (stderr += d));
		const timer = setTimeout(() => {
			timedOut = true;
			try { process.kill(-child.pid, "SIGKILL"); } catch {}
		}, timeoutMs);
		child.on("close", (code) => {
			clearTimeout(timer);
			resolvePromise({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
		});
	});
}

function summarizeEvents(stdout) {
	const summary = { toolCalls: {}, toolErrors: 0, turns: 0, tokens: 0, cost: 0, models: new Set(), errors: [] };
	for (const line of stdout.split("\n")) {
		if (!line.trim()) continue;
		let event;
		try { event = JSON.parse(line); } catch { continue; }
		if (event.type === "tool_execution_start") summary.toolCalls[event.toolName] = (summary.toolCalls[event.toolName] ?? 0) + 1;
		else if (event.type === "tool_execution_end" && event.isError) summary.toolErrors++;
		else if (event.type === "turn_end") summary.turns++;
		else if (event.type === "message_end" && event.message?.role === "assistant") {
			const m = event.message;
			summary.tokens += m.usage?.totalTokens ?? 0;
			summary.cost += m.usage?.cost?.total ?? 0;
			if (m.provider && m.model) summary.models.add(`${m.provider}/${m.model}`);
			if (m.stopReason === "error" || m.errorMessage) summary.errors.push(m.errorMessage ?? "error");
		}
	}
	return { ...summary, models: [...summary.models] };
}

// ─── Orchestration ──────────────────────────────────────────────────────────

async function runOne({ task, arm, attempt, opts, extraExtensions }) {
	const workspace = mkdtempSync(join(tmpdir(), "ee-bench-"));
	try {
		writeTree(workspace, task.input);
		const proc = await runPi({
			cwd: workspace,
			prompt: task.prompt,
			model: opts.model,
			thinking: opts.thinking,
			extensions: [...extraExtensions, ...arm.extensions],
			timeoutMs: opts.timeout * 1000,
		});
		const events = summarizeEvents(proc.stdout);
		const diffs = verifyTree(workspace, task.expected);
		const wrongModel = events.models.some((m) => m !== opts.model);
		const failure = proc.timedOut ? "timeout"
			: wrongModel ? `model-mismatch ${events.models.join(",")}`
			: events.errors.length ? `provider-error: ${events.errors[0]}`.slice(0, 300)
			: proc.code !== 0 ? `exit ${proc.code}: ${proc.stderr.trim().split("\n").at(-1) ?? ""}`.slice(0, 300)
			: diffs.length ? "mismatch" : null;
		return {
			arm: arm.name,
			armVersion: arm.version,
			task: task.id,
			family: taskFamily(task.id),
			attempt,
			pass: failure === null,
			failure,
			diffs: diffs.slice(0, 5),
			durationMs: proc.durationMs,
			...events,
		};
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
}

async function pool(items, limit, worker) {
	let index = 0;
	const runners = Array.from({ length: Math.max(1, limit) }, async () => {
		while (index < items.length) {
			const item = items[index++];
			await worker(item);
		}
	});
	await Promise.all(runners);
}

function pct(n, d) {
	return d ? `${((100 * n) / d).toFixed(1)}%` : "-";
}

function report(results, opts, meta) {
	const arms = [...new Set(results.map((r) => r.arm))];
	const families = [...new Set(results.map((r) => r.family))].sort();
	const lines = [];
	lines.push(`# Explicit Edit (local) — ${opts.model}`, "");
	lines.push(`Benchmark commit ${meta.benchCommit}; ${meta.taskCount} tasks × ${opts.repeat} repeat(s); thinking ${opts.thinking}. Unsandboxed local runs: compare arms, do not publish.`, "");
	lines.push("| Arm | Version | Pass | Rate | Avg tools | Tool errors | Avg tokens | Cost | Avg time |", "|---|---|---|---|---|---|---|---|---|");
	for (const arm of arms) {
		const rs = results.filter((r) => r.arm === arm);
		const pass = rs.filter((r) => r.pass).length;
		const tools = rs.reduce((s, r) => s + Object.values(r.toolCalls).reduce((a, b) => a + b, 0), 0);
		const toolErrors = rs.reduce((s, r) => s + r.toolErrors, 0);
		const tokens = rs.reduce((s, r) => s + r.tokens, 0);
		const cost = rs.reduce((s, r) => s + r.cost, 0);
		const time = rs.reduce((s, r) => s + r.durationMs, 0);
		lines.push(`| ${arm} | ${rs[0]?.armVersion ?? ""} | ${pass}/${rs.length} | ${pct(pass, rs.length)} | ${(tools / rs.length).toFixed(1)} | ${toolErrors} | ${Math.round(tokens / rs.length)} | $${cost.toFixed(3)} | ${(time / rs.length / 1000).toFixed(1)}s |`);
	}
	lines.push("", "## By family", "", `| Family | ${arms.join(" | ")} |`, `|---|${arms.map(() => "---").join("|")}|`);
	for (const family of families) {
		const cells = arms.map((arm) => {
			const rs = results.filter((r) => r.arm === arm && r.family === family);
			return `${rs.filter((r) => r.pass).length}/${rs.length}`;
		});
		lines.push(`| ${family} | ${cells.join(" | ")} |`);
	}
	const byTask = new Map();
	for (const r of results) {
		const key = `${r.task}#${r.attempt}`;
		if (!byTask.has(key)) byTask.set(key, new Map());
		byTask.get(key).set(r.arm, r);
	}
	const disagreements = [...byTask.entries()].filter(([, m]) => new Set([...m.values()].map((r) => r.pass)).size > 1);
	lines.push("", `## Tasks where arms disagree (${disagreements.length})`, "");
	for (const [key, m] of disagreements) {
		const cells = arms.map((arm) => {
			const r = m.get(arm);
			return r ? `${arm}: ${r.pass ? "pass" : `FAIL (${r.failure}${r.diffs[0] ? `; ${r.diffs[0]}` : ""})`}` : `${arm}: -`;
		});
		lines.push(`- \`${key}\` — ${cells.join("; ")}`);
	}
	const failures = results.filter((r) => !r.pass && r.failure !== "mismatch");
	if (failures.length) {
		lines.push("", `## Non-verification failures (${failures.length})`, "");
		for (const r of failures) lines.push(`- ${r.arm} \`${r.task}\`: ${r.failure}`);
	}
	return lines.join("\n") + "\n";
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const benchCommit = ensureBenchCheckout(opts.benchDir);
	const all = await loadTasks(opts.benchDir);
	const tasks = selectTasks(all, opts);
	if (opts.list) {
		for (const task of tasks) console.log(task.id);
		return;
	}
	const arms = opts.arms.map(resolveArm);
	const extraExtensions = providerExtensions(opts.model, opts.providerExtensions);
	mkdirSync(opts.out, { recursive: true });
	const resultsPath = join(opts.out, "results.jsonl");
	const done = new Set();
	const results = [];
	if (opts.resume && existsSync(resultsPath)) {
		for (const line of readFileSync(resultsPath, "utf8").split("\n").filter(Boolean)) {
			const r = JSON.parse(line);
			results.push(r);
			done.add(`${r.arm}|${r.task}|${r.attempt}`);
		}
	}
	writeFileSync(join(opts.out, "run.json"), JSON.stringify({ ...opts, benchCommit, arms, extraExtensions, tasks: tasks.map((t) => t.id) }, null, 2));

	// Interleave arms per task so provider drift during a run affects every arm alike.
	const jobs = [];
	for (let attempt = 1; attempt <= opts.repeat; attempt++) {
		for (const task of tasks) for (const arm of arms) {
			if (!done.has(`${arm.name}|${task.id}|${attempt}`)) jobs.push({ task, arm, attempt });
		}
	}
	console.error(`${jobs.length} runs: ${tasks.length} tasks × ${arms.length} arms × ${opts.repeat} → ${opts.out}`);
	let finished = 0;
	await pool(jobs, opts.concurrency, async (job) => {
		const result = await runOne({ ...job, opts, extraExtensions });
		results.push(result);
		appendFileSync(resultsPath, JSON.stringify(result) + "\n");
		finished++;
		const tools = Object.entries(result.toolCalls).map(([k, v]) => `${k}×${v}`).join(" ");
		console.error(`[${finished}/${jobs.length}] ${result.pass ? "PASS" : "FAIL"} ${result.arm.padEnd(14)} ${result.task.padEnd(44)} ${(result.durationMs / 1000).toFixed(0).padStart(4)}s ${tools}${result.pass ? "" : `  ${result.failure}${result.diffs[0] ? ` — ${result.diffs[0]}` : ""}`}`);
	});
	const markdown = report(results, opts, { benchCommit, taskCount: tasks.length });
	writeFileSync(join(opts.out, "summary.md"), markdown);
	console.log(markdown);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack ?? error.message : error);
	process.exit(1);
});
