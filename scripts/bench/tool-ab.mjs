#!/usr/bin/env node
/**
 * A/B of tool arms for the tools-vs-bash arc: does an agent do better with this extension's
 * `find`, `ls` and `grep`, or with bash? Each run is one task in a fresh workspace, through the
 * selected host's own Pi CLI (PI_COMPAT_HOST, else the locked Pi), headless (`pi -p --mode json`).
 * The system prompt names the host's docs, so a host inside this checkout is replaced by its version
 * installed under ~/.cache/pi-hashline-readmap/bench-hosts, and a run after which the checkout's tree
 * differs fails and stops the harness:
 *
 *   stock             stock Pi: read, bash, edit, write
 *   extension         this checkout's index.ts, every tool it registers
 *   no-ls-find        the extension with --exclude-tools ls,find
 *   no-ls-find-grep   the extension with --exclude-tools ls,find,grep
 *
 * An arm is what it declares: text in another tool naming an excluded one, and bash's hints, stay.
 *
 * Tasks: the locate-first tasks (scripts/bench/locate-tasks), each on the pinned snapshot
 * committed into a fresh git repo and scored by its checker in a child process, and an Explicit
 * Edit control (scripts/bench/explicit-edit.mjs), scored byte-exact. Each task and model runs every
 * arm back to back, the arm order rotating; every first repeat runs before any second.
 *
 * A run is launched only while the spent cost plus, for it and each run in flight, the most any
 * run has cost stays within --max-cost; until one run finishes, one runs alone.
 *
 * Usage:
 *   node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna --max-cost 1
 *   node scripts/bench/tool-ab.mjs --models openai-codex/gpt-6-luna --tasks ansi-cursor-codes --repeat 2 --max-cost 0.5
 *
 * Options:
 *   --models LIST        Comma-separated Pi models (required)
 *   --max-cost USD       Spending cap for the whole run, resumed runs included (required)
 *   --arms LIST          Comma-separated arms (default: all four)
 *   --tasks IDS          Comma-separated task ids from either set (default: every locate task and
 *                        the Explicit Edit control tasks)
 *   --repeat N           Runs of every (task, model, arm) (default: 2)
 *   --concurrency N      Parallel Pi processes (default: 2)
 *   --timeout S          Seconds per run (default: 300)
 *   --thinking LEVEL     Pi thinking level (default: off)
 *   --out DIR            Results directory (default: tmp/bench-results/tool-ab-<timestamp>); one
 *                        that holds results needs --resume
 *   --resume             Skip runs already in DIR/results.jsonl, counting their cost; refused when
 *                        the host, the extension's tree, the snapshot, thinking or timeout changed
 *   --provider-extension PATH   Extra extension that provides the model (repeatable)
 *   --bench-dir DIR      Explicit Edit checkout (default: tmp/explicit-edit-benchmark, cloned if missing)
 *   --list               Print the selected task ids and exit
 *
 * Writes DIR/run.json (options, host, the total spent), DIR/results.jsonl (one line per run),
 * DIR/traces/<model>/<arm>/<task>#<repeat>.jsonl and DIR/summary.md.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { selectCompatHost } from "../pi-compat-host.mjs";
import { scoreSession } from "./confusion.mjs";
import { ensureBenchCheckout, loadTasks, providerExtensions, verifyTree, writeTree } from "./explicit-edit.mjs";
import { runPi, summarizeEvents } from "./lib.mjs";
import { extractSnapshot, SNAPSHOT, TASKS } from "./locate-tasks/tasks.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK_SCRIPT = join(REPO, "scripts/bench/locate-tasks/check.mjs");
const CHECK_TIMEOUT_MS = 60_000;

export const ARMS = [
	{ name: "stock", extension: false, exclude: [] },
	{ name: "extension", extension: true, exclude: [] },
	{ name: "no-ls-find", extension: true, exclude: ["ls", "find"] },
	{ name: "no-ls-find-grep", extension: true, exclude: ["ls", "find", "grep"] },
];

/** The Explicit Edit control: three families at three scales, where the prompt names every file. */
const DEFAULT_EDIT_TASKS = ["unique-1000-plain", "multi-file-1-unicode", "replace-block-10-unicode"];

// ─── Tasks ──────────────────────────────────────────────────────────────────

/** Run a locate task's checker in a child process, since it imports model-written code that may hang. */
function checkInChild(id, root, timeoutMs) {
	return new Promise((done) => {
		const child = spawn(process.execPath, [CHECK_SCRIPT, id, root], { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => (stdout += d));
		child.stderr.on("data", (d) => (stderr += d));
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			done([`check timed out after ${timeoutMs / 1000}s`]);
		}, timeoutMs);
		child.on("close", (code) => {
			clearTimeout(timer);
			let failures;
			try { failures = JSON.parse(stdout); } catch {}
			done(code === 0 && Array.isArray(failures) ? failures : [`check exited ${code}: ${stderr.trim().split("\n").at(-1) ?? ""}`.slice(0, 300)]);
		});
	});
}

/** A locate task on the snapshot, committed into a fresh repo so git works as in a real checkout. */
export function locateTask(task) {
	return {
		set: "locate",
		id: task.id,
		prompt: task.prompt,
		prepare: (dir) => {
			extractSnapshot(dir);
			const git = (...args) => execFileSync("git", ["-c", "user.name=bench", "-c", "user.email=bench@localhost", "-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "ignore" });
			git("init", "--quiet");
			git("add", "-A");
			git("commit", "--quiet", "--no-verify", "-m", `snapshot ${SNAPSHOT}`);
		},
		verify: (dir, timeoutMs) => checkInChild(task.id, dir, timeoutMs),
	};
}

/** An Explicit Edit task: its input tree, compared byte-exact with its expected tree, so no `.git`. */
function editTask(task) {
	return {
		set: "edit",
		id: task.id,
		prompt: task.prompt,
		prepare: (dir) => writeTree(dir, task.input),
		verify: async (dir) => verifyTree(dir, task.expected),
	};
}

async function selectTasks(opts) {
	const locate = TASKS.map(locateTask);
	const wanted = opts.tasks ?? [...locate.map((task) => task.id), ...DEFAULT_EDIT_TASKS];
	const needsEdit = wanted.some((id) => !locate.some((task) => task.id === id));
	const benchCommit = needsEdit ? ensureBenchCheckout(opts.benchDir) : null;
	const edit = needsEdit ? (await loadTasks(opts.benchDir)).map(editTask) : [];
	const byId = new Map([...locate, ...edit].map((task) => [task.id, task]));
	const tasks = wanted.map((id) => {
		const task = byId.get(id);
		if (!task) throw new Error(`Unknown task id: ${id}`);
		return task;
	});
	return { tasks, benchCommit };
}

// ─── Scheduling ─────────────────────────────────────────────────────────────

/** Every arm of one task and model back to back, the arm order rotating; every first repeat before any second. */
export function planJobs({ tasks, arms, models, repeat }) {
	const jobs = [];
	let group = 0;
	for (let attempt = 1; attempt <= repeat; attempt++) {
		for (const task of tasks) for (const model of models) {
			const start = group++ % arms.length;
			for (let i = 0; i < arms.length; i++) jobs.push({ task, model, attempt, arm: arms[(start + i) % arms.length] });
		}
	}
	return jobs;
}

/**
 * Run jobs at most `concurrency` at a time, launching one only while `spent` plus, for it and each run
 * in flight, `maxRunCost` (the most any run has cost) stays within `maxCost`; with no cost known yet,
 * one runs alone. A worker that throws fails the whole run once the runs in flight finish.
 * shortcut: a run can cost more than any before it, so the total can pass the cap by that excess per
 * run in flight; kill the runs in flight at the cap if a pilot overshoots.
 */
export function runJobs(jobs, { concurrency, maxCost, spent, maxRunCost }, worker) {
	return new Promise((resolvePromise, rejectPromise) => {
		let next = 0;
		let inFlight = 0;
		let failure = null;
		const admit = () => (maxRunCost === null ? inFlight === 0 && spent < maxCost : spent + (inFlight + 1) * maxRunCost <= maxCost);
		const pump = () => {
			while (!failure && next < jobs.length && inFlight < concurrency && admit()) {
				const job = jobs[next++];
				inFlight++;
				Promise.resolve()
					.then(() => worker(job))
					.then(
						(result) => {
							spent += result.cost;
							maxRunCost = Math.max(maxRunCost ?? 0, result.cost);
						},
						(error) => { failure ??= error; },
					)
					.finally(() => {
						inFlight--;
						pump();
					});
			}
			if (inFlight > 0) return;
			if (failure) rejectPromise(failure);
			else resolvePromise({ spent, skipped: jobs.length - next });
		};
		pump();
	});
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/** The event summary plus the confusion signals of a `pi --mode json` stream. */
export function scoreRun(stdout) {
	const { calls, tasks } = scoreSession(stdout);
	const count = (flag) => calls.filter((call) => call[flag]).length;
	return {
		...summarizeEvents(stdout),
		confusion: {
			errors: count("error"),
			rejected: count("rejected"),
			redundant: count("redundant"),
			wrongTool: count("wrongTool"),
			callsBeforeTouch: tasks[0]?.callsBeforeTouch ?? null,
		},
	};
}

const SETS = ["locate", "edit"];
/** Each metric of one run; null leaves the run out of that metric. */
const METRICS = {
	pass: (run) => Number(run.pass),
	inputTokens: (run) => run.inputTokens,
	cost: (run) => run.cost,
	toolCalls: (run) => Object.values(run.toolCalls).reduce((sum, n) => sum + n, 0),
	errors: (run) => run.confusion.errors,
	rejected: (run) => run.confusion.rejected,
	redundant: (run) => run.confusion.redundant,
	wrongTool: (run) => run.confusion.wrongTool,
	callsBeforeTouch: (run) => run.confusion.callsBeforeTouch,
};
const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

/** One row per task set, model and arm: each metric's mean per run, and its spread between the repeats' means. */
export function summarizeRuns(results) {
	const groups = new Map();
	for (const run of results) {
		const key = `${run.set}|${run.model}|${run.arm}`;
		if (!groups.has(key)) groups.set(key, []);
		groups.get(key).push(run);
	}
	const models = [...new Set(results.map((run) => run.model))];
	const armIndex = (name) => {
		const index = ARMS.findIndex((arm) => arm.name === name);
		return index === -1 ? ARMS.length : index;
	};
	const order = ({ set, model, arm }) => [SETS.indexOf(set), models.indexOf(model), armIndex(arm)];
	return [...groups.values()]
		.sort((a, b) => {
			const [x, y] = [order(a[0]), order(b[0])];
			return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
		})
		.map((runs) => {
			const attempts = [...new Set(runs.map((run) => run.attempt))];
			const metrics = Object.fromEntries(Object.entries(METRICS).map(([name, of]) => {
				const values = (subset) => subset.map(of).filter((value) => value !== null);
				const perRepeat = attempts.map((attempt) => mean(values(runs.filter((run) => run.attempt === attempt)))).filter((value) => value !== null);
				return [name, { mean: mean(values(runs)), spread: perRepeat.length > 1 ? Math.max(...perRepeat) - Math.min(...perRepeat) : null }];
			}));
			return {
				set: runs[0].set,
				model: runs[0].model,
				arm: runs[0].arm,
				runs: runs.length,
				repeats: attempts.length,
				passed: runs.filter((run) => run.pass).length,
				totalCost: runs.reduce((sum, run) => sum + run.cost, 0),
				metrics,
			};
		});
}

/** Each column: metric, header, decimals, scale, prefix, suffix. */
const COLUMNS = [
	["pass", "Rate", 1, 100, "", "%"],
	["inputTokens", "Input tokens", 0, 1, "", ""],
	["cost", "Cost", 4, 1, "$", ""],
	["toolCalls", "Tool calls", 1, 1, "", ""],
	["errors", "Errors", 2, 1, "", ""],
	["rejected", "Rejected", 2, 1, "", ""],
	["redundant", "Redundant", 2, 1, "", ""],
	["wrongTool", "Wrong tool", 2, 1, "", ""],
	["callsBeforeTouch", "Calls before touch", 1, 1, "", ""],
];

export function formatSummary({ rows, results, meta }) {
	const cell = ({ mean: value, spread }, digits, scale, prefix, suffix) => (value === null
		? "-"
		: `${prefix}${(value * scale).toFixed(digits)}${suffix}${spread === null ? "" : ` Δ${(spread * scale).toFixed(digits)}`}`);
	const failed = results.filter((run) => !run.pass);
	return [
		`# Tool arms A/B — ${meta.models.join(", ")}`,
		"",
		`Pi ${meta.hostVersion}; arms ${meta.arms.join(", ")}; ${meta.repeat} repeat(s); spent $${meta.spent.toFixed(4)} of $${meta.maxCost}${meta.skipped ? `; ${meta.skipped} runs skipped at the cap` : ""}.`,
		"Each cell is the mean per run; Δ is the spread, the largest minus the smallest per-repeat mean. Errors include rejected calls; calls before touch counts runs that edited.",
		"",
		`| Set | Model | Arm | Pass | ${COLUMNS.map(([, header]) => header).join(" | ")} |`,
		`|---|---|---|---|${COLUMNS.map(() => "---").join("|")}|`,
		...rows.map((row) => `| ${row.set} | ${row.model} | ${row.arm} | ${row.passed}/${row.runs} | ${COLUMNS.map(([metric, , ...format]) => cell(row.metrics[metric], ...format)).join(" | ")} |`),
		"",
		`## Failed runs (${failed.length})`,
		"",
		...failed.map((run) => `- ${run.set} ${run.model} ${run.arm} \`${run.task}#${run.attempt}\`: ${run.failure}${run.diffs[0] ? ` — ${run.diffs[0]}` : ""}`),
	].join("\n") + "\n";
}

// ─── Running ────────────────────────────────────────────────────────────────

/** What an extension arm loads, and the harness that scores it; other paths, such as docs or an --out inside the repo, may change. */
const TREATMENT_PATHS = ["index.ts", "src", "prompts", "scripts", "package.json", "package-lock.json"];

/**
 * A hash of a checkout's uncommitted changes under TREATMENT_PATHS, null when it has none.
 * shortcut: covers tracked changes and untracked names, not untracked contents; hash those too if a resume must vouch for them.
 */
export function treeChanges(repo) {
	const git = (...args) => execFileSync("git", ["-C", repo, ...args, "--", ...TREATMENT_PATHS], { encoding: "utf8" });
	const changes = git("status", "--porcelain") + git("diff", "HEAD", "--binary");
	return changes ? createHash("sha256").update(changes).digest("hex").slice(0, 16) : null;
}

/** Where a host's version is installed when the selected one sits inside the checkout. */
const HOST_CACHE = join(homedir(), ".cache/pi-hashline-readmap/bench-hosts");
/** The whole Pi graph, pinned to one version, by AGENTS.md's "Host compatibility". */
const PI_PACKAGES = ["pi-coding-agent", "pi-agent-core", "pi-ai", "pi-tui", "pi-mcp", "pi-codemode", "pi-schema", "pi-telemetry"];

const isInside = (path, dir) => {
	const rel = relative(realpathSync(dir), realpathSync(path));
	return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`);
};

function installHost(version, prefix) {
	execFileSync("npm", ["install", "--prefix", prefix, "--no-save", "--package-lock=false", "--no-audit", "--no-fund", ...PI_PACKAGES.map((name) => `@earendil-works/${name}@${version}`)], { stdio: ["ignore", "ignore", "inherit"] });
}

/**
 * The selected host, run from outside `repo`: the system prompt names the host's docs, which would
 * lead a model into the checkout. A host inside it is replaced by its version installed under `cacheDir`.
 */
export function benchHost({ host, version }, repo, { cacheDir = HOST_CACHE, install = installHost } = {}) {
	if (isInside(host, repo)) {
		mkdirSync(cacheDir, { recursive: true });
		if (isInside(cacheDir, repo)) throw new Error(`The host ${host} and its install directory ${cacheDir} are both inside the checkout ${repo}, which a run would reach through the system prompt`);
		const prefix = join(cacheDir, version);
		host = join(prefix, "node_modules/@earendil-works/pi-coding-agent");
		if (!existsSync(join(host, "package.json"))) {
			// Install beside it, then rename, so an interrupted install is never taken for a whole one.
			const staging = mkdtempSync(`${prefix}-`);
			try {
				install(version, staging);
				renameSync(staging, prefix);
			} finally {
				rmSync(staging, { recursive: true, force: true });
			}
		}
	}
	const manifest = JSON.parse(readFileSync(join(host, "package.json"), "utf8"));
	if (manifest.version !== version) throw new Error(`${host} holds Pi ${manifest.version}, not the selected ${version}`);
	return { host, version, cli: join(host, manifest.bin.pi) };
}

/**
 * The tree of everything in `repo` that git tracks or would add, outside `exclude`: what a run must leave as it found it.
 * shortcut: ignored paths (node_modules, tmp, dist) go unseen; hash them too if a run is found writing there.
 */
export function checkoutTree(repo, exclude = []) {
	const scratch = mkdtempSync(join(tmpdir(), "tool-ab-index-"));
	try {
		const git = (...args) => execFileSync("git", ["-C", repo, ...args], { env: { ...process.env, GIT_INDEX_FILE: join(scratch, "index") }, encoding: "utf8" });
		const ignored = (path) => {
			try {
				git("check-ignore", "-q", path);
				return true;
			} catch {
				return false;
			}
		};
		// git refuses a pathspec naming an ignored path, which the default --out under tmp/ is.
		const excluded = exclude.filter((path) => existsSync(path) && isInside(path, repo) && !ignored(path)).map((path) => `:(exclude)${relative(realpathSync(repo), realpathSync(path))}`);
		git("add", "-A", "--", ".", ...excluded);
		return git("write-tree").trim();
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
}

/**
 * `run` for each job, its result passed to `record`. A run after which the checkout's tree differs from
 * before the first is recorded failed, and the worker throws, so `runJobs` launches nothing more.
 */
export function guardedWorker(run, record, { repo, exclude }) {
	const before = checkoutTree(repo, exclude);
	return async (job) => {
		const result = await run(job);
		const escaped = checkoutTree(repo, exclude) !== before;
		const final = escaped ? { ...result, pass: false, failure: "checkout-changed" } : result;
		record(final);
		if (escaped) throw new Error(`The checkout ${repo} changed during a run, so no more runs were launched: revert the change, then --resume`);
		return final;
	};
}

async function runOne({ task, arm, model, attempt }, opts, host) {
	const workspace = mkdtempSync(join(tmpdir(), "tool-ab-"));
	try {
		task.prepare(workspace);
		const proc = await runPi({
			cwd: workspace,
			prompt: task.prompt,
			model,
			thinking: opts.thinking,
			extensions: [...providerExtensions(model, opts.providerExtensions), ...(arm.extension ? [join(REPO, "index.ts")] : [])],
			excludeTools: arm.exclude,
			cli: host.cli,
			timeoutMs: opts.timeout * 1000,
		});
		const traceDir = join(opts.out, "traces", model.replace(/[^\w.-]+/g, "_"), arm.name);
		mkdirSync(traceDir, { recursive: true });
		writeFileSync(join(traceDir, `${task.id}#${attempt}.jsonl`), proc.stdout + (proc.stderr ? `\n${JSON.stringify({ type: "stderr", text: proc.stderr })}\n` : ""));
		const diffs = await task.verify(workspace, CHECK_TIMEOUT_MS);
		const score = scoreRun(proc.stdout);
		const wrongModel = score.models.some((m) => m !== model);
		const failure = proc.timedOut ? "timeout"
			: wrongModel ? `model-mismatch ${score.models.join(",")}`
			: score.errors.length ? `provider-error: ${score.errors[0]}`.slice(0, 300)
			: proc.code !== 0 ? `exit ${proc.code}: ${proc.stderr.trim().split("\n").at(-1) ?? ""}`.slice(0, 300)
			: diffs.length ? (task.set === "edit" ? "mismatch" : "check") : null;
		return { set: task.set, task: task.id, arm: arm.name, model, attempt, pass: failure === null, failure, diffs: diffs.slice(0, 5), durationMs: proc.durationMs, ...score };
	} finally {
		rmSync(workspace, { recursive: true, force: true });
	}
}

function parseArgs(argv) {
	const opts = {
		arms: ARMS.map((arm) => arm.name),
		repeat: 2,
		concurrency: 2,
		timeout: 300,
		thinking: "off",
		providerExtensions: [],
		benchDir: resolve(REPO, "tmp/explicit-edit-benchmark"),
	};
	const list = (text) => text.split(",").map((s) => s.trim()).filter(Boolean);
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = () => {
			const next = argv[++i];
			if (next === undefined) throw new Error(`Missing value for ${flag}`);
			return next;
		};
		switch (flag) {
			case "--models": opts.models = list(value()); break;
			case "--max-cost": opts.maxCost = Number(value()); break;
			case "--arms": opts.arms = list(value()); break;
			case "--tasks": opts.tasks = list(value()); break;
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
	for (const name of opts.arms) if (!ARMS.some((arm) => arm.name === name)) throw new Error(`Unknown arm: ${name} (use ${ARMS.map((arm) => arm.name).join(", ")})`);
	if (!opts.list) {
		if (!opts.models?.length) throw new Error("--models is required (e.g. openai-codex/gpt-6-luna)");
		if (!(opts.maxCost > 0)) throw new Error("--max-cost is required: a positive spending cap in dollars");
	}
	for (const key of ["repeat", "concurrency", "timeout"]) if (!(Number.isInteger(opts[key]) && opts[key] > 0)) throw new Error(`--${key} needs a positive integer`);
	opts.out ??= resolve(REPO, "tmp/bench-results", `tool-ab-${new Date().toISOString().replace(/[:.]/g, "-")}`);
	return opts;
}

async function main(argv) {
	const opts = parseArgs(argv);
	const { tasks, benchCommit } = await selectTasks(opts);
	if (opts.list) {
		for (const task of tasks) console.log(`${task.set}\t${task.id}`);
		return;
	}
	const host = benchHost(selectCompatHost(), REPO);
	const arms = ARMS.filter((arm) => opts.arms.includes(arm.name));
	const extension = { entry: join(REPO, "index.ts"), commit: execFileSync("git", ["-C", REPO, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), changes: treeChanges(REPO) };
	// What a run repeats: a resume that changed any of these would compare different treatments as one arm.
	const treatment = { host: { version: host.version, cli: host.cli }, extension, snapshot: SNAPSHOT, thinking: opts.thinking, timeout: opts.timeout };
	mkdirSync(opts.out, { recursive: true });
	const resultsPath = join(opts.out, "results.jsonl");
	const runPath = join(opts.out, "run.json");
	if (!opts.resume && existsSync(resultsPath)) throw new Error(`${opts.out} already holds results: pass --resume to continue that run, or choose another --out`);
	const before = opts.resume && existsSync(runPath) ? JSON.parse(readFileSync(runPath, "utf8")) : null;
	if (before) {
		const changed = Object.keys(treatment).filter((field) => !isDeepStrictEqual(before[field], treatment[field]));
		if (before.benchCommit && benchCommit && before.benchCommit !== benchCommit) changed.push("benchCommit");
		if (changed.length) throw new Error(`--resume: ${changed.join(", ")} changed since ${runPath} was written, so new runs would not repeat the old ones`);
	}
	const previous = opts.resume && existsSync(resultsPath)
		? readFileSync(resultsPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
		: [];
	const results = [...previous];
	const key = (run) => `${run.model}|${run.arm}|${run.task}|${run.attempt}`;
	const done = new Set(previous.map(key));
	const jobs = planJobs({ tasks, arms, models: opts.models, repeat: opts.repeat })
		.filter((job) => !done.has(key({ model: job.model, arm: job.arm.name, task: job.task.id, attempt: job.attempt })));
	const run = {
		...opts,
		...treatment,
		benchCommit: benchCommit ?? before?.benchCommit ?? null,
		armDefinitions: arms,
		taskIds: tasks.map((task) => task.id),
		startedAt: before?.startedAt ?? new Date().toISOString(),
	};
	const writeRun = (extra) => writeFileSync(runPath, JSON.stringify({ ...run, ...extra }, null, 2));
	const spentBefore = previous.reduce((sum, r) => sum + r.cost, 0);
	writeRun({ spent: spentBefore });
	console.error(`${jobs.length} runs: ${tasks.length} tasks × ${opts.models.length} models × ${arms.length} arms × ${opts.repeat}, Pi ${host.version}, cap $${opts.maxCost} → ${opts.out}`);
	let finished = 0;
	const outcome = await runJobs(jobs, {
		concurrency: opts.concurrency,
		maxCost: opts.maxCost,
		spent: spentBefore,
		maxRunCost: previous.length ? Math.max(...previous.map((r) => r.cost)) : null,
	}, guardedWorker((job) => runOne(job, opts, host), (result) => {
		results.push(result);
		appendFileSync(resultsPath, JSON.stringify(result) + "\n");
		const tools = Object.entries(result.toolCalls).map(([k, v]) => `${k}×${v}`).join(" ");
		console.error(`[${++finished}/${jobs.length}] ${result.pass ? "PASS" : "FAIL"} ${result.model} ${result.arm.padEnd(15)} ${`${result.task}#${result.attempt}`.padEnd(40)} $${result.cost.toFixed(4)} ${(result.durationMs / 1000).toFixed(0).padStart(4)}s ${tools}${result.pass ? "" : `  ${result.failure}${result.diffs[0] ? ` — ${result.diffs[0]}` : ""}`}`);
	}, { repo: REPO, exclude: [opts.out] }));
	writeRun({ spent: outcome.spent, skipped: outcome.skipped, finishedAt: new Date().toISOString() });
	const markdown = formatSummary({
		rows: summarizeRuns(results),
		results,
		meta: { models: opts.models, arms: arms.map((arm) => arm.name), repeat: opts.repeat, hostVersion: host.version, spent: outcome.spent, maxCost: opts.maxCost, skipped: outcome.skipped },
	});
	writeFileSync(join(opts.out, "summary.md"), markdown);
	console.log(markdown);
}

// Node resolves symlinks in the module URL, so compare the script's real path.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main(process.argv.slice(2)).catch((error) => {
		console.error(error instanceof Error ? error.stack ?? error.message : error);
		process.exit(1);
	});
}
