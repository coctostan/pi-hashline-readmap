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
// Real `pi --mode json` streams (Pi 1.5.2, openai-codex/gpt-6-luna, 2026-11-18), message_update events dropped and long
// strings, arrays and tool parameters trimmed: a dictated read, then six edits of a.ts through Hashline's edit, and through
// Pi's own under PI_HASHLINE_BUILTIN=edit,write.
const hashlineEdits = readFileSync(join(fixtures, "edit-failures-hashline.jsonl"), "utf8");
const piEdits = readFileSync(join(fixtures, "edit-failures-pi.jsonl"), "utf8");
const lines = (entries: unknown[]) => entries.map((entry) => JSON.stringify(entry)).join("\n");

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
		// a compaction's systemMessage is a complete checkpoint: it replaces the tool set rather than adding to it
		const compacted = [
			{ type: "message", message: { role: "system", toolsAdded: [{ name: "bash" }, { name: "grep" }] } },
			{ type: "compaction", systemMessage: { role: "system", toolsAdded: [{ name: "bash" }] } },
			{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "k1", name: "bash", arguments: { command: "rg foo" } }] } },
		].map((entry) => JSON.stringify(entry)).join("\n");
		expect(scoreSession(compacted).calls[0]).toMatchObject({ wrongTool: null, toolSetKnown: true });
		// Pi sends a changed declaration as a removal plus an addition of the same name, and replays removals first
		const redefined = [
			{ type: "message", message: { role: "system", toolsAdded: [{ name: "bash" }, { name: "grep" }] } },
			{ type: "message", message: { role: "system", toolsRemoved: [{ name: "grep" }], toolsAdded: [{ name: "grep" }] } },
			{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "k2", name: "bash", arguments: { command: "rg foo" } }] } },
		].map((entry) => JSON.stringify(entry)).join("\n");
		expect(scoreSession(redefined).calls[0].wrongTool).toBe("[Hint: Prefer the grep tool for content search.]");
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
		// src/a.ts.bak is another file; a sentence ending in src/a.ts. names the edited one
		const dotted = [
			{ type: "session", cwd: "/repo" },
			{ type: "message", message: { role: "user", content: "Fix a." } },
			{ type: "message", message: { role: "assistant", content: [
				{ type: "toolCall", id: "d1", name: "read", arguments: { path: "src/a.ts.bak" } },
				{ type: "toolCall", id: "d2", name: "bash", arguments: { command: "git log -1 --stat" } },
				{ type: "toolCall", id: "d3", name: "edit", arguments: { path: "src/a.ts", edits: [] } },
			] } },
			{ type: "message", message: { role: "toolResult", toolCallId: "d2", toolName: "bash", content: [{ type: "text", text: "Changed src/a.ts." }] } },
		].map((entry) => JSON.stringify(entry)).join("\n");
		expect(scoreSession(dotted).tasks).toEqual([{ editId: "d3", callsBeforeTouch: 1, touchedBy: "bash" }]);
	});

	it("reads a search tool's result paths relative to its path argument", () => {
		// grep with path src prints src/a.ts as a.ts (Pi 1.5.0, measured 2026-11-05); bash output stays cwd-relative
		const scoped = [
			{ type: "session", cwd: "/repo" },
			{ type: "message", message: { role: "user", content: "Fix a." } },
			{ type: "message", message: { role: "assistant", content: [
				{ type: "toolCall", id: "s1", name: "bash", arguments: { command: "cd src && ls" } },
				{ type: "toolCall", id: "s2", name: "grep", arguments: { pattern: "foo", path: "lib" } },
				{ type: "toolCall", id: "s3", name: "grep", arguments: { pattern: "foo", path: "src" } },
				{ type: "toolCall", id: "s4", name: "edit", arguments: { path: "src/a.ts", edits: [] } },
			] } },
			{ type: "message", message: { role: "toolResult", toolCallId: "s1", toolName: "bash", content: [{ type: "text", text: "a.ts" }] } },
			{ type: "message", message: { role: "toolResult", toolCallId: "s2", toolName: "grep", content: [{ type: "text", text: "--- a.ts (1 matches) ---" }] } },
			{ type: "message", message: { role: "toolResult", toolCallId: "s3", toolName: "grep", content: [{ type: "text", text: "--- a.ts (1 matches) ---\na.ts:>>3:abc|foo()" }] } },
		].map((entry) => JSON.stringify(entry)).join("\n");
		expect(scoreSession(scoped).tasks).toEqual([{ editId: "s4", callsBeforeTouch: 2, touchedBy: "grep" }]);
	});

	it("scores a --mode json event stream as it scores a session file", () => {
		const scored = scoreSession(trace);
		expect(scored.calls.map((call) => [call.tool, call.error, call.toolSetKnown])).toEqual([
			["read", false, true], ["grep", false, true], ["edit", false, true],
		]);
		expect(scored.tasks).toEqual([{ editId: scored.calls[2].id, callsBeforeTouch: 0, touchedBy: "read" }]);
	});

	it("classes each refused edit of Hashline's by its error code, or a thrown error's text, and a landed one as none", () => {
		// hash-mismatch, text-not-found, ambiguous-match, invalid-edit-variant, then a thrown `Invalid line reference`, then landed
		expect(scoreSession(hashlineEdits).calls.map((call) => [call.tool, call.editFailure])).toEqual([
			["read", null], ["edit", "anchor"], ["edit", "text"], ["edit", "text"], ["edit", "arguments"], ["edit", "anchor"], ["edit", null],
		]);
	});

	it("classes each refused edit of Pi's own by its error text", () => {
		// text not found, two occurrences, empty edits, empty oldText, then two landed
		expect(scoreSession(piEdits).calls.map((call) => [call.tool, call.editFailure])).toEqual([
			["read", null], ["edit", "text"], ["edit", "text"], ["edit", "arguments"], ["edit", "arguments"], ["edit", null], ["edit", null],
		]);
	});

	it("classes a refusal before the tool ran as arguments, a known text behind a notice line, and any other error as other", () => {
		const edit = (id: string) => ({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name: "edit", arguments: { path: "a.ts" } }] } });
		const refused = (id: string, text: string) => ({ type: "message", message: { role: "toolResult", toolCallId: id, content: [{ type: "text", text }], isError: true } });
		const session = lines([
			edit("e1"), refused("e1", 'Validation failed for tool "edit": edits must be array'),
			edit("e2"), refused("e2", "[Context hygiene] 1 earlier tool result no longer reflects current state. Do not treat it as current:\n- read (file:/w/a.ts): [Stale read result]\n\nLine 9 does not exist (file has 8 lines). Re-read the file for current anchors."),
			edit("e3"), refused("e3", "Invalid edits: expected array, received null."),
			edit("e4"), refused("e4", "Permission denied: a.ts"),
			// a code the classes leave out is other, whatever its text
			edit("e5"), { type: "message", message: { role: "toolResult", toolCallId: "e5", content: [{ type: "text", text: "Found 2 occurrences of x overlapping" }], details: { ptcValue: { error: { code: "overlapping-edit" } } }, isError: true } },
			{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "w1", name: "write", arguments: { path: "a.ts" } }] } },
			refused("w1", "Could not find the exact text in a.ts."),
		]);
		expect(scoreSession(session).calls.map((call) => call.editFailure)).toEqual(["arguments", "anchor", "arguments", "other", "other", null]);
	});

	it("counts, per edited file, the reads of that file before its first edit", () => {
		expect(scoreSession(hashlineEdits).editedFiles).toEqual([{ path: "/private/tmp/s4drive/a.ts", readsBefore: 1 }]);
		const call = (id: string, name: string, path: string) => ({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: { path } }] } });
		const session = lines([
			{ type: "session", cwd: "/repo" },
			call("r1", "read", "src/a.ts"), call("r2", "read", "/repo/src/a.ts"), call("r3", "read", "src/b.ts"),
			call("e1", "edit", "./src/a.ts"),
			call("r4", "read", "src/a.ts"), call("e2", "edit", "src/a.ts"),
			call("e3", "edit", "src/c.ts"),
		]);
		// a.ts read twice (two path forms) before its first edit, the read after it not counted; c.ts edited unread; b.ts never edited
		expect(scoreSession(session).editedFiles).toEqual([{ path: "/repo/src/a.ts", readsBefore: 2 }, { path: "/repo/src/c.ts", readsBefore: 0 }]);
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
