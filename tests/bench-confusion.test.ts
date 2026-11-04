import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreSession, summarizeCorpus } from "../scripts/bench/confusion.mjs";

const fixtures = new URL("./fixtures/bench/", import.meta.url).pathname;
const corpusFile = (dir: string, name: string) => readFileSync(join(fixtures, "corpus", dir, name), "utf8");
const main = corpusFile("--repo--", "2026-11-04T10-00-00-000Z_main.jsonl");
const fork = corpusFile("--repo--", "2026-11-04T11-00-00-000Z_fork.jsonl");
const legacy = corpusFile("--legacy--", "2026-11-04T12-00-00-000Z_legacy.jsonl");
// A real `pi --mode json` stream (Pi 1.5.0, openai-codex/gpt-6-luna), trimmed; see tests/bench-lib.test.ts.
const trace = readFileSync(join(fixtures, "explicit-edit-trace.jsonl"), "utf8");

const byId = (text: string) => Object.fromEntries(scoreSession(text).calls.map((call) => [call.id, call]));

describe("scoreSession", () => {
	it("records each tool call of a session file with its result bytes and error kind", () => {
		const calls = byId(main);
		expect(Object.keys(calls)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12", "c13", "c16", "c17", "c18"]);
		expect(calls.c3).toMatchObject({ tool: "grep", resultBytes: 42, error: false, rejected: false });
		expect(calls.c2).toMatchObject({ tool: "find", error: true, rejected: true });
		expect(calls.c8).toMatchObject({ tool: "ls", error: true, rejected: false });
		expect(calls.c13).toMatchObject({ tool: "read", resultBytes: null, error: false });
	});

	it("flags a search repeating an earlier one's arguments, whatever their key order or nulls, until an edit or write", () => {
		const calls = byId(main);
		expect(Object.values(calls).filter((call) => call.redundant).map((call) => call.id)).toEqual(["c4", "c11"]);
	});

	it("flags bash that the hint table would point at an active tool, and leaves it unscored without a recorded tool set", () => {
		const calls = byId(main);
		expect(calls.c1.wrongTool).toBe("[Hint: Prefer the grep tool for content search.]");
		expect(calls.c9.wrongTool).toBeNull(); // grep was removed from the tool set before this call
		expect(calls.c10.wrongTool).toBe("[Hint: Prefer the read tool for file contents.]");
		expect(calls.c10.toolSetKnown).toBe(true);
		const [legacyCall] = scoreSession(legacy).calls;
		expect(legacyCall).toMatchObject({ tool: "bash", wrongTool: null, toolSetKnown: false });
		// a pipe filter is no repo search: only each pipeline's head is scored
		expect(byId(fork).c19).toMatchObject({ tool: "bash", wrongTool: null, redundant: false, toolSetKnown: true });
	});

	it("counts, per task with an edit, the calls before the first one naming the edited file", () => {
		expect(scoreSession(main).tasks).toEqual([
			// neither lib/src/a.ts nor src/a.tsx in the rg result is src/a.ts; the grep result naming src/a.ts is the touch
			{ editId: "c6", callsBeforeTouch: 2, touchedBy: "grep" },
			// the edit names /repo/src/a.ts; `grep -rn foo .` prints it as ./src/a.ts
			{ editId: "c12", callsBeforeTouch: 0, touchedBy: "bash" },
			// a file outside the cwd, named as the edit gives it, ../other/b.md: `ls ../other` is not a touch, the read is
			{ editId: "c18", callsBeforeTouch: 1, touchedBy: "read" },
		]);
		expect(scoreSession(legacy).tasks).toEqual([]);
	});

	it("scores a --mode json event stream as it scores a session file", () => {
		const scored = scoreSession(trace);
		expect(scored.calls.map((call) => [call.tool, call.error, call.toolSetKnown])).toEqual([
			["read", false, true], ["grep", false, true], ["edit", false, true],
		]);
		expect(scored.tasks).toEqual([{ editId: scored.calls[2].id, callsBeforeTouch: 0, touchedBy: "read" }]);
	});
});

describe("summarizeCorpus", () => {
	it("totals the per-tool counts and signals, counting a forked session's copied calls once", () => {
		const summary = summarizeCorpus([main, fork, legacy].map(scoreSession));
		expect(summary).toMatchObject({ sessions: 3, calls: 19, duplicates: 2, unknownToolSet: 1 });
		const tools = Object.fromEntries(summary.tools.map(({ name, ...rest }) => [name, rest]));
		expect(Object.keys(tools)).toEqual(["bash", "grep", "read", "edit", "ls", "find"]);
		expect(tools.bash).toEqual({ calls: 7, errors: 0, rejected: 0, redundant: 1, wrongTool: 2, bytes: { p50: 9, p90: 34, p99: 34, total: 85 } });
		expect(tools.grep).toEqual({ calls: 3, errors: 0, rejected: 0, redundant: 1, wrongTool: 0, bytes: { p50: 42, p90: 42, p99: 42, total: 95 } });
		expect(tools.read.bytes).toEqual({ p50: 7, p90: 27, p99: 27, total: 34 }); // c13 has no result
		expect(tools.ls).toMatchObject({ calls: 2, errors: 1, rejected: 0, bytes: { p50: 9, p90: 28, p99: 28, total: 37 } });
		expect(tools.find).toMatchObject({ calls: 1, errors: 1, rejected: 1 });
		expect(summary.wrongTool).toEqual({
			"[Hint: Prefer the grep tool for content search.]": 1,
			"[Hint: Prefer the read tool for file contents.]": 1,
		});
		expect(summary.tasks).toEqual({ count: 3, callsBeforeTouch: { p50: 1, p90: 2, p99: 2 }, touchedBy: { grep: 1, bash: 1, read: 1 } });
	});

	it("reports no percentiles for a corpus without results", () => {
		const summary = summarizeCorpus([]);
		expect(summary).toMatchObject({ sessions: 0, calls: 0, tools: [], tasks: { count: 0, callsBeforeTouch: null } });
	});
});
