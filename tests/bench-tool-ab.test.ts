import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TASKS } from "../scripts/bench/locate-tasks/tasks.mjs";
import { ARMS, formatSummary, locateTask, planJobs, runJobs, scoreRun, summarizeRuns, treeChanges, type RunResult } from "../scripts/bench/tool-ab.mjs";

const line = (event: unknown) => JSON.stringify(event);
const call = (id: string, name: string, args: Record<string, unknown>) => ({ type: "toolCall", id, name, arguments: args });
const result = (id: string, text: string, isError = false) => line({ type: "message_end", message: { role: "toolResult", toolCallId: id, content: [{ type: "text", text }], isError } });

describe("ARMS", () => {
	it("are stock Pi, the extension, and the extension without ls and find, then without grep too", () => {
		expect(ARMS).toEqual([
			{ name: "stock", extension: false, exclude: [] },
			{ name: "extension", extension: true, exclude: [] },
			{ name: "no-ls-find", extension: true, exclude: ["ls", "find"] },
			{ name: "no-ls-find-grep", extension: true, exclude: ["ls", "find", "grep"] },
		]);
	});
});

describe("planJobs", () => {
	const tasks = ["a", "b", "c"].map((id) => ({ id }));
	const jobs = planJobs({ tasks, arms: ARMS, models: ["m1", "m2"], repeat: 2 });
	const key = (job: (typeof jobs)[number]) => `${job.attempt}|${job.task.id}|${job.model}`;

	it("plans every arm for every task, model and repeat once", () => {
		expect(jobs).toHaveLength(3 * 4 * 2 * 2);
		expect(new Set(jobs.map((job) => `${key(job)}|${job.arm.name}`)).size).toBe(jobs.length);
	});

	it("runs the arms of one task and model back to back, each group starting with a different arm", () => {
		const groups = Array.from({ length: jobs.length / ARMS.length }, (_, i) => jobs.slice(i * ARMS.length, (i + 1) * ARMS.length));
		for (const group of groups) {
			expect(new Set(group.map(key)).size).toBe(1);
			expect(new Set(group.map((job) => job.arm.name)).size).toBe(ARMS.length);
		}
		const firsts = groups.map((group) => group[0].arm.name);
		for (let i = 1; i < firsts.length; i++) expect(firsts[i]).not.toBe(firsts[i - 1]);
	});

	it("finishes every first repeat before any second", () => {
		const lastFirst = jobs.map((job) => job.attempt).lastIndexOf(1);
		expect(jobs.findIndex((job) => job.attempt === 2)).toBe(lastFirst + 1);
	});
});

describe("runJobs", () => {
	const fakeWorker = (cost: number, log: { inFlight: number; peak: number; launched: number }) => async () => {
		log.launched++;
		log.peak = Math.max(log.peak, ++log.inFlight);
		await new Promise((done) => setTimeout(done, 5));
		log.inFlight--;
		return { cost };
	};

	it("never launches a run its projected cost would take past the cap, one run alone until a cost is known", async () => {
		const log = { inFlight: 0, peak: 0, launched: 0 };
		const outcome = await runJobs(Array.from({ length: 10 }, (_, i) => i), { concurrency: 3, maxCost: 1, spent: 0, maxRunCost: null }, fakeWorker(0.4, log));
		expect(log.launched).toBe(2);
		expect(outcome).toEqual({ spent: expect.closeTo(0.8, 10), skipped: 8 });
	});

	it("projects the most any run has cost, not the latest", async () => {
		const costs = [0.5, 0.1, 0.1, 0.1];
		let launched = 0;
		const outcome = await runJobs(costs, { concurrency: 1, maxCost: 1, spent: 0, maxRunCost: null }, async (cost) => {
			launched++;
			return { cost };
		});
		// after 0.5 and 0.1, one more 0.5-sized run would reach 1.1
		expect(launched).toBe(2);
		expect(outcome).toEqual({ spent: expect.closeTo(0.6, 10), skipped: 2 });
	});
	it("counts what resumed runs already spent", async () => {
		const log = { inFlight: 0, peak: 0, launched: 0 };
		const outcome = await runJobs([1, 2, 3], { concurrency: 3, maxCost: 1, spent: 0.7, maxRunCost: 0.4 }, fakeWorker(0.4, log));
		expect(log.launched).toBe(0);
		expect(outcome).toEqual({ spent: 0.7, skipped: 3 });
	});

	it("keeps to the concurrency once a cost is known, and runs everything under the cap", async () => {
		const log = { inFlight: 0, peak: 0, launched: 0 };
		const outcome = await runJobs(Array.from({ length: 9 }, (_, i) => i), { concurrency: 3, maxCost: 100, spent: 0, maxRunCost: null }, fakeWorker(0.01, log));
		expect(log.peak).toBe(3);
		expect(outcome.skipped).toBe(0);
		expect(log.launched).toBe(9);
	});

	it("fails the whole run when a worker throws, after the runs in flight finish", async () => {
		let finished = 0;
		const worker = async (n: number) => {
			if (n === 1) throw new Error("harness bug");
			await new Promise((done) => setTimeout(done, 5));
			finished++;
			return { cost: 0 };
		};
		await expect(runJobs([0, 1, 2, 3], { concurrency: 2, maxCost: 1, spent: 0, maxRunCost: 0 }, worker)).rejects.toThrow("harness bug");
		expect(finished).toBe(1);
	});
});

describe("scoreRun", () => {
	const stream = [
		line({ type: "session", cwd: "/w" }),
		line({ type: "message_end", message: { role: "system", toolsAdded: ["read", "bash", "grep", "edit"].map((name) => ({ name })) } }),
		line({ type: "message_end", message: { role: "user", content: "fix it" } }),
		...["grep", "grep", "bash", "read", "edit"].map((toolName) => line({ type: "tool_execution_start", toolName })),
		line({
			type: "message_end",
			message: {
				role: "assistant", provider: "p", model: "m",
				usage: { input: 100, cacheRead: 50, cacheWrite: 0, output: 10, totalTokens: 160, cost: { total: 0.01 } },
				content: [call("1", "grep", { pattern: "x" }), call("2", "grep", { pattern: "x" }), call("3", "bash", { command: "rg foo" }), call("4", "read", { limit: "x" })],
			},
		}),
		result("1", "no matches"),
		result("2", "src/a.ts:1:x"),
		result("3", "nothing"),
		result("4", 'Validation failed for tool "read": path is required', true),
		line({
			type: "message_end",
			message: { role: "assistant", provider: "p", model: "m", usage: { input: 200, output: 5, totalTokens: 205, cost: { total: 0.02 } }, content: [call("5", "edit", { path: "src/a.ts" })] },
		}),
		result("5", "edited"),
	].join("\n");

	it("adds input tokens and the confusion signals to the event summary", () => {
		expect(scoreRun(stream)).toEqual({
			toolCalls: { grep: 2, bash: 1, read: 1, edit: 1 },
			toolErrors: 0,
			turns: 0,
			tokens: 365,
			inputTokens: 350,
			cost: expect.closeTo(0.03, 10),
			models: ["p/m"],
			errors: [],
			confusion: { errors: 1, rejected: 1, redundant: 1, wrongTool: 1, callsBeforeTouch: 1 },
		});
	});

	it("leaves calls before the first touch unknown when nothing was edited", () => {
		expect(scoreRun(line({ type: "message_end", message: { role: "user", content: "hi" } })).confusion.callsBeforeTouch).toBeNull();
	});
});

const run = (overrides: Partial<RunResult>): RunResult => ({
	set: "locate", task: "t1", arm: "stock", model: "m", attempt: 1, pass: true, failure: null, diffs: [], durationMs: 1000,
	toolCalls: { read: 2 }, toolErrors: 0, turns: 1, tokens: 0, inputTokens: 1000, cost: 0.01, models: ["m"], errors: [],
	confusion: { errors: 0, rejected: 0, redundant: 0, wrongTool: 0, callsBeforeTouch: 2 },
	...overrides,
});

describe("summarizeRuns", () => {
	const results = [
		run({ task: "t1", attempt: 1 }),
		run({ task: "t2", attempt: 1, pass: false, failure: "check", inputTokens: 3000, cost: 0.03, toolCalls: { read: 1, bash: 3 }, confusion: { errors: 2, rejected: 1, redundant: 1, wrongTool: 1, callsBeforeTouch: null } }),
		run({ task: "t1", attempt: 2, inputTokens: 2000 }),
		run({ task: "t2", attempt: 2, inputTokens: 2000 }),
		run({ arm: "extension", attempt: 1 }),
		run({ set: "edit", task: "e1", attempt: 1 }),
	];
	const rows = summarizeRuns(results);
	const stock = rows.find((row) => row.set === "locate" && row.arm === "stock")!;

	it("gives one row per task set, model and arm, in arm order", () => {
		expect(rows.map((row) => `${row.set}|${row.model}|${row.arm}`)).toEqual(["locate|m|stock", "locate|m|extension", "edit|m|stock"]);
	});

	it("gives each metric's mean per run and its spread between the repeats' means", () => {
		expect(stock.runs).toBe(4);
		expect(stock.repeats).toBe(2);
		expect(stock.totalCost).toBeCloseTo(0.06, 10);
		expect(stock.metrics.pass).toEqual({ mean: 0.75, spread: 0.5 });
		expect(stock.metrics.inputTokens).toEqual({ mean: 2000, spread: 0 });
		expect(stock.metrics.cost.mean).toBeCloseTo(0.015, 10);
		expect(stock.metrics.cost.spread).toBeCloseTo(0.01, 10);
		expect(stock.metrics.toolCalls).toEqual({ mean: 2.5, spread: 1 });
		expect(stock.metrics.errors).toEqual({ mean: 0.5, spread: 1 });
		expect(stock.metrics.redundant).toEqual({ mean: 0.25, spread: 0.5 });
		expect(stock.metrics.wrongTool).toEqual({ mean: 0.25, spread: 0.5 });
		expect(stock.metrics.rejected).toEqual({ mean: 0.25, spread: 0.5 });
	});

	it("skips runs with no edit in calls before the first touch", () => {
		expect(stock.metrics.callsBeforeTouch).toEqual({ mean: 2, spread: 0 });
	});

	it("has no spread with one repeat", () => {
		expect(rows.find((row) => row.arm === "extension")!.metrics.pass).toEqual({ mean: 1, spread: null });
	});

	it("prints each row with its spread", () => {
		const text = formatSummary({ rows, results, meta: { models: ["m"], arms: ["stock", "extension"], repeat: 2, hostVersion: "1.5.0", spent: 0.08, maxCost: 1, skipped: 0 } });
		expect(text).toContain("| locate | m | stock | 3/4 | 75.0% Δ50.0 | 2000 Δ0 | $0.0150 Δ0.0100 | 2.5 Δ1.0 | 0.50 Δ1.00 | 0.25 Δ0.50 | 0.25 Δ0.50 | 0.25 Δ0.50 | 2.0 Δ0.0 |");
		expect(text).toContain("| locate | m | extension | 1/1 | 100.0% | 1000 | $0.0100 | 2.0 | 0.00 | 0.00 | 0.00 | 0.00 | 2.0 |");
		expect(text).toContain("- locate m stock `t2#1`: check");
	});
});

describe("locateTask", () => {
	const ansi = locateTask(TASKS.find((task) => task.id === "ansi-cursor-codes")!);
	let dir: string;

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), "tool-ab-"));
		ansi.prepare(dir);
	}, 60_000);

	afterAll(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
	});

	it("prepares the snapshot as a git repo with everything committed", () => {
		expect(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })).toBe("");
		expect(execFileSync("git", ["grep", "-l", "stripAnsi", "--", "src/ansi.ts"], { cwd: dir, encoding: "utf8" }).trim()).toBe("src/ansi.ts");
	});

	it("checks in a child process", async () => {
		expect(await ansi.verify(dir, 30_000)).toEqual([expect.stringMatching(/^cursor codes: got/)]);
	}, 30_000);

	it("fails a check that hangs once its timeout passes", async () => {
		writeFileSync(join(dir, "src/ansi.ts"), "while (true) {}\nexport const stripAnsi = (s: string) => s;\n");
		expect(await ansi.verify(dir, 2000)).toEqual(["check timed out after 2s"]);
	}, 30_000);
});

describe("treeChanges", () => {
	it("hashes uncommitted changes to what an arm loads, and nothing else", () => {
		const repo = mkdtempSync(join(tmpdir(), "tool-ab-tree-"));
		try {
			const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
			mkdirSync(join(repo, "src"));
			writeFileSync(join(repo, "index.ts"), "export {};\n");
			writeFileSync(join(repo, "src/a.ts"), "export const a = 1;\n");
			git("init", "--quiet");
			git("add", "-A");
			git("commit", "--quiet", "--no-verify", "-m", "init");
			expect(treeChanges(repo)).toBeNull();
			// an --out inside the repo, and a doc, are not the treatment
			mkdirSync(join(repo, "bench-results"));
			writeFileSync(join(repo, "bench-results/results.jsonl"), "{}\n");
			writeFileSync(join(repo, "NOTES.md"), "notes\n");
			expect(treeChanges(repo)).toBeNull();
			writeFileSync(join(repo, "src/a.ts"), "export const a = 2;\n");
			const edited = treeChanges(repo);
			expect(edited).toMatch(/^[0-9a-f]{16}$/);
			writeFileSync(join(repo, "src/b.ts"), "export const b = 1;\n");
			expect(treeChanges(repo)).not.toBe(edited);
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});
});
describe("tool-ab.mjs through a stub host", () => {
	const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const script = join(repo, "scripts/bench/tool-ab.mjs");
	let scratch: string;
	let host: string;
	let out: string;
	const runCli = (...extra: string[]) => spawnSync(
		process.execPath,
		[script, "--models", "p/m", "--max-cost", "1", "--tasks", "ansi-cursor-codes", "--repeat", "1", "--out", out, ...extra],
		{ env: { ...process.env, PI_COMPAT_HOST: host }, encoding: "utf8" },
	);

	beforeAll(() => {
		scratch = mkdtempSync(join(tmpdir(), "tool-ab-cli-"));
		host = join(scratch, "host");
		out = join(scratch, "out");
		mkdirSync(host);
		// A host whose Pi CLI records the arguments it was launched with.
		writeFileSync(join(host, "package.json"), JSON.stringify({ version: "0.0.0-stub", bin: { pi: "cli.mjs" } }));
		writeFileSync(join(host, "cli.mjs"), "console.log(JSON.stringify({ type: \"stub\", argv: process.argv.slice(2) }));\n");
	});

	afterAll(() => {
		if (scratch) rmSync(scratch, { recursive: true, force: true });
	});

	it("launches each arm through the selected host's CLI, with its extension and exclusions", () => {
		const first = runCli();
		expect(first.status, first.stderr).toBe(0);
		const launch = (arm: string) => {
			const trace = readFileSync(join(out, "traces/p_m", arm, "ansi-cursor-codes#1.jsonl"), "utf8");
			const argv: string[] = JSON.parse(trace.split("\n")[0]).argv;
			const excludeAt = argv.indexOf("--exclude-tools");
			return { extensions: argv.filter((_arg, i) => argv[i - 1] === "-e"), exclude: excludeAt === -1 ? null : argv[excludeAt + 1] };
		};
		const index = join(repo, "index.ts");
		expect(Object.fromEntries(ARMS.map((arm) => [arm.name, launch(arm.name)]))).toEqual({
			stock: { extensions: [], exclude: null },
			extension: { extensions: [index], exclude: null },
			"no-ls-find": { extensions: [index], exclude: "ls,find" },
			"no-ls-find-grep": { extensions: [index], exclude: "ls,find,grep" },
		});
		const run = JSON.parse(readFileSync(join(out, "run.json"), "utf8"));
		expect(run).toMatchObject({ host: { version: "0.0.0-stub", cli: join(host, "cli.mjs") }, spent: 0, skipped: 0 });
	}, 120_000);

	it("refuses a directory that holds results without --resume", () => {
		const again = runCli();
		expect(again.status).not.toBe(0);
		expect(again.stderr).toContain("pass --resume");
	});

	it("resumes only the same treatment", () => {
		const resumed = runCli("--resume");
		expect(resumed.status, resumed.stderr).toBe(0);
		expect(resumed.stderr).toContain("0 runs");
		const runPath = join(out, "run.json");
		const run = JSON.parse(readFileSync(runPath, "utf8"));
		writeFileSync(runPath, JSON.stringify({ ...run, extension: { ...run.extension, commit: "0".repeat(40) } }));
		const changed = runCli("--resume");
		expect(changed.status).not.toBe(0);
		expect(changed.stderr).toContain("--resume: extension changed");
	});
});
