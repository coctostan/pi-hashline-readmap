import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TASKS } from "../scripts/bench/locate-tasks/tasks.mjs";
import { ARMS, benchHost, checkoutTree, formatSummary, guardedWorker, locateTask, planJobs, runJobs, scoreRun, summarizeRuns, treeChanges, type RunResult } from "../scripts/bench/tool-ab.mjs";

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
		const text = formatSummary({ rows, results, meta: { models: ["m"], arms: ["stock", "extension"], repeat: 2, hostVersion: "1.5.0", spent: 0.08, maxCost: 1, skipped: 0, startedAt: "2026-11-13T12:00:00.000Z" } });
		expect(text).toContain("| locate | m | stock | 3/4 | 75.0% Δ50.0 | 2000 Δ0 | $0.0150 Δ0.0100 | 2.5 Δ1.0 | 0.50 Δ1.00 | 0.25 Δ0.50 | 0.25 Δ0.50 | 0.25 Δ0.50 | 2.0 Δ0.0 |");
		expect(text).toContain("| locate | m | extension | 1/1 | 100.0% | 1000 | $0.0100 | 2.0 | 0.00 | 0.00 | 0.00 | 0.00 | 2.0 |");
		expect(text).toContain("- locate m stock `t2#1`: check");
	});

	it("dates the summary line with the run's start day in UTC", () => {
		// 02:12 UTC is the previous day in New York, so a local-date summary fails here on any machine.
		const zone = process.env.TZ;
		process.env.TZ = "America/New_York";
		try {
			const text = formatSummary({ rows: [], results: [], meta: { models: ["openai-codex/gpt-6-luna", "anthropic-cc/claude-sonnet-5-5"], arms: ["stock", "extension", "no-ls-find", "no-ls-find-grep"], repeat: 2, hostVersion: "1.5.0", spent: 3.4812406800000018, maxCost: 18, skipped: 0, startedAt: "2026-11-05T02:12:31.122Z" } });
			expect(text.split("\n")[2]).toBe("Pi 1.5.0 on 2026-11-05; arms stock, extension, no-ls-find, no-ls-find-grep; 2 repeat(s); spent $3.4812 of $18.");
		} finally {
			if (zone === undefined) delete process.env.TZ;
			else process.env.TZ = zone;
		}
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

	it("leaves no git maintenance running in the background to write into the workspace", () => {
		// git commit starts `git maintenance run --auto`, which detaches and may repack the snapshot while the workspace is being removed.
		const scratch = mkdtempSync(join(tmpdir(), "tool-ab-trace-"));
		const trace = join(scratch, "trace2.jsonl");
		const saved = process.env.GIT_TRACE2_EVENT;
		process.env.GIT_TRACE2_EVENT = trace;
		try {
			ansi.prepare(join(scratch, "workspace"));
			const started: string[][] = readFileSync(trace, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
				.filter((event) => event.event === "start").map((event) => event.argv);
			expect(started.some((argv) => argv.includes("commit"))).toBe(true);
			expect(started.filter((argv) => argv.includes("maintenance"))).toEqual([]);
		} finally {
			if (saved === undefined) delete process.env.GIT_TRACE2_EVENT;
			else process.env.GIT_TRACE2_EVENT = saved;
			rmSync(scratch, { recursive: true, force: true });
		}
	}, 60_000);
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

const gitRepo = (files: Record<string, string>) => {
	const repo = mkdtempSync(join(tmpdir(), "tool-ab-checkout-"));
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(repo, path)), { recursive: true });
		writeFileSync(join(repo, path), text);
	}
	const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: repo, stdio: "ignore" });
	git("init", "--quiet");
	git("add", "-A");
	git("commit", "--quiet", "--no-verify", "-m", "init");
	return repo;
};

describe("benchHost", () => {
	const stubHost = (dir: string, version: string) => {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "package.json"), JSON.stringify({ version, bin: { pi: "dist/cli.js" } }));
	};
	let scratch: string;
	let repo: string;
	let inside: string;

	beforeAll(() => {
		scratch = mkdtempSync(join(tmpdir(), "tool-ab-host-"));
		repo = join(scratch, "repo");
		inside = join(repo, "node_modules/@earendil-works/pi-coding-agent");
		stubHost(inside, "1.2.3");
	});

	afterAll(() => {
		if (scratch) rmSync(scratch, { recursive: true, force: true });
	});

	it("runs a host outside the checkout as it is", () => {
		const outside = join(scratch, "override");
		stubHost(outside, "9.9.9");
		const install = () => { throw new Error("installed"); };
		expect(benchHost({ host: outside, version: "9.9.9" }, repo, { cacheDir: join(scratch, "cache"), install })).toEqual({ host: outside, version: "9.9.9", cli: join(outside, "dist/cli.js") });
	});

	it("installs the version of a host inside the checkout outside it, once", () => {
		const cacheDir = join(scratch, "cache");
		const installs: string[] = [];
		const install = (version: string, prefix: string) => {
			installs.push(version);
			stubHost(join(prefix, "node_modules/@earendil-works/pi-coding-agent"), version);
		};
		const host = join(cacheDir, "1.2.3/node_modules/@earendil-works/pi-coding-agent");
		const expected = { host, version: "1.2.3", cli: join(host, "dist/cli.js") };
		expect(benchHost({ host: inside, version: "1.2.3" }, repo, { cacheDir, install })).toEqual(expected);
		expect(benchHost({ host: inside, version: "1.2.3" }, repo, { cacheDir, install })).toEqual(expected);
		expect(installs).toEqual(["1.2.3"]);
	});

	it("refuses an installed host that resolves into the checkout", () => {
		const cacheDir = join(scratch, "linked-cache");
		mkdirSync(cacheDir);
		symlinkSync(repo, join(cacheDir, "1.2.3"));
		const install = () => { throw new Error("installed"); };
		expect(() => benchHost({ host: inside, version: "1.2.3" }, repo, { cacheDir, install })).toThrow(/inside the checkout/);
	});

	it("leaves nothing behind from an install that fails", () => {
		const cacheDir = join(scratch, "failing-cache");
		const install = () => { throw new Error("registry down"); };
		expect(() => benchHost({ host: inside, version: "1.2.3" }, repo, { cacheDir, install })).toThrow("registry down");
		expect(readdirSync(cacheDir)).toEqual([]);
	});

	it("refuses a host inside the checkout when its install would be inside too", () => {
		const install = () => { throw new Error("installed"); };
		expect(() => benchHost({ host: inside, version: "1.2.3" }, repo, { cacheDir: join(repo, "tmp/hosts"), install })).toThrow(/inside the checkout/);
	});
});

describe("checkoutTree", () => {
	it("changes with any file git tracks or would add, and with nothing ignored or excluded", () => {
		const repo = gitRepo({ "src/a.ts": "a\n", ".gitignore": "tmp/\n" });
		try {
			// an --out outside what git ignores, and one inside it, as the default tmp/bench-results is
			mkdirSync(join(repo, "out"));
			mkdirSync(join(repo, "tmp/bench-results"), { recursive: true });
			const tree = () => checkoutTree(repo, [join(repo, "out"), join(repo, "tmp/bench-results")]);
			const clean = tree();
			expect(clean).toBe(execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repo, encoding: "utf8" }).trim());
			writeFileSync(join(repo, "tmp/scratch.txt"), "ignored\n");
			writeFileSync(join(repo, "tmp/bench-results/results.jsonl"), "{}\n");
			writeFileSync(join(repo, "out/results.jsonl"), "{}\n");
			expect(tree()).toBe(clean);
			writeFileSync(join(repo, "notes.md"), "one\n");
			const untracked = tree();
			expect(untracked).not.toBe(clean);
			writeFileSync(join(repo, "notes.md"), "two\n");
			expect(tree()).not.toBe(untracked);
			expect(execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" })).toBe("?? notes.md\n?? out/\n");
		} finally {
			rmSync(repo, { recursive: true, force: true });
		}
	});
});

describe("guardedWorker", () => {
	it("fails a run after which the checkout changed, records it, and launches nothing more", async () => {
		const repo = gitRepo({ "src/a.ts": "a\n" });
		try {
			const launched: number[] = [];
			const recorded: Array<{ job: number; pass: boolean; failure: string | null }> = [];
			const run = async (job: number) => {
				launched.push(job);
				if (job === 1) writeFileSync(join(repo, "src/a.ts"), "escaped\n");
				return { job, cost: 0.01, pass: true, failure: null };
			};
			const worker = guardedWorker(run, (result) => recorded.push(result), { repo, exclude: [] });
			await expect(runJobs([0, 1, 2, 3], { concurrency: 1, maxCost: 1, spent: 0, maxRunCost: null }, worker)).rejects.toThrow(/checkout .* changed/);
			expect(launched).toEqual([0, 1]);
			expect(recorded).toEqual([
				{ job: 0, cost: 0.01, pass: true, failure: null },
				{ job: 1, cost: 0.01, pass: false, failure: "checkout-changed" },
			]);
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
