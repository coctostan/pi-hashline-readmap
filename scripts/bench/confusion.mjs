/**
 * Score tool use in a Pi session file or a `pi --mode json` event stream: each tool call with its
 * result bytes and the confusion signals, and per task the calls spent before the edited file is found.
 *
 * Both inputs carry the same messages: a session file as `message` entries (plus a compaction's
 * `systemMessage`), an event stream as `message_end` events. System messages declare the active
 * tools; replaying their `toolsAdded`/`toolsRemoved` gives the tool set each call was made under.
 */
import { isAbsolute, relative, resolve } from "node:path";
import { getBashAntiPatternHint } from "../../src/bash-anti-pattern-hints.ts";

const encoder = new TextEncoder();
// Pi refuses these calls before the tool runs (pi-ai utils/validation.js, the agent loop's tool lookup).
const REJECTED = /^(Invalid arguments for tool "|Validation failed for tool "|Tool "?[\w.-]+"? not found)/;
const SEARCH_TOOLS = new Set(["grep", "find", "ls", "ast_search"]);
const BASH_SEARCH = /(^|[\s|&;()])(grep|rg|find|fd|ls|tree)(?=$|[\s|&;()])/;
const MUTATING_TOOLS = new Set(["edit", "write"]);

const textOf = (content) => typeof content === "string"
	? content
	: (content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("\n");
/** Arguments as a key: keys sorted, nulls dropped, so `{a, b: null}` and `{a}` repeat each other. */
const argumentKey = (value) => JSON.stringify(value, (_key, inner) => inner && typeof inner === "object" && !Array.isArray(inner)
	? Object.fromEntries(Object.keys(inner).sort().filter((key) => inner[key] != null).map((key) => [key, inner[key]]))
	: inner);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Each pipeline's first command, joined: `npm test | grep x` filters output and searches no files, so it scores as `npm test`.
 * shortcut: splits on `|`, `;`, `&&` and `||` even inside quotes, so `echo "a; grep x"` yields a false head; use a bash parser if a miss turns up.
 */
const pipelineHeads = (command) => command.split(/&&|\|\||;|\n/).map((part) => part.split("|")[0].trim()).filter(Boolean).join("; ");

// shortcut: reads a session file in file order, not along its /tree branches, so a tool-set change on an abandoned branch
// carries over; 2 of 2524 corpus files branch and no score changed (2026-11-04), replay along parentId if branching grows.
function messagesOf(text) {
	let cwd = null;
	const messages = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		let entry;
		try { entry = JSON.parse(line); } catch { continue; }
		if (entry.type === "session") cwd ??= entry.cwd ?? null;
		else if (entry.type === "message" || entry.type === "message_end") messages.push(entry.message);
		else if (entry.type === "compaction" && entry.systemMessage) messages.push({ ...entry.systemMessage, checkpoint: true });
	}
	return { cwd, messages };
}

/** Score one session file or event stream. */
export function scoreSession(text) {
	const { cwd, messages } = messagesOf(text);
	const calls = [];
	const tasks = [];
	const byId = new Map();
	let activeTools = null;
	// shortcut: only edit and write end a search's redundancy; a mutating bash command does not, refine if it skews the count.
	let searches = new Set();
	let task = null;

	/**
	 * A text names the file as the edit gives it, absolute, or relative to the cwd with or without `./`; with `base`,
	 * a search tool's `path` argument, also relative to it, as the tool prints its results (grep in src prints a.ts).
	 */
	const touches = (given, base = null) => {
		const target = cwd ? resolve(cwd, given) : given;
		const within = (from) => {
			const rel = relative(from, target);
			return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : null;
		};
		const rel = cwd ? within(cwd) : null;
		const fromBase = cwd && base !== null ? within(resolve(cwd, base)) : null;
		const forms = [...new Set([given, target, ...(rel ? [rel, `./${rel}`] : []), ...(fromBase ? [fromBase] : [])])];
		// After the path: no name character, and no `.` running into another extension (src/a.ts.bak), though a full stop may end it.
		const pattern = new RegExp(`(^|[^\\w./-])(${forms.map(escapeRegExp).join("|")})(?![\\w/-]|\\.\\w)`);
		return (text) => pattern.test(text);
	};
	const closeTask = () => {
		if (!task?.edit) return;
		const touched = touches(task.edit.path);
		const last = task.calls.indexOf(task.edit.entry);
		const found = task.calls.findIndex((entry, i) => i <= last && (touched(entry.argsText)
			|| (entry.searchBase === null ? touched : touches(task.edit.path, entry.searchBase))(entry.resultText)));
		// The edit itself touches its file, even where JSON escaping hides the path from the pattern.
		const index = found === -1 ? last : found;
		tasks.push({ editId: task.edit.entry.record.id, callsBeforeTouch: index, touchedBy: task.calls[index].record.tool });
	};

	for (const message of messages) {
		if (!message) continue;
		if (message.role === "system") {
			if (message.checkpoint || !activeTools) activeTools = new Set();
			// Removals first, as Pi replays them: a changed declaration is a removal plus an addition of the same name.
			for (const tool of message.toolsRemoved ?? []) activeTools.delete(tool.name);
			for (const tool of message.toolsAdded ?? []) activeTools.add(tool.name);
		} else if (message.role === "user") {
			closeTask();
			task = { calls: [], edit: null };
		} else if (message.role === "assistant") {
			for (const block of Array.isArray(message.content) ? message.content : []) {
				if (block.type !== "toolCall" || byId.has(block.id)) continue;
				const args = block.arguments ?? {};
				const heads = block.name === "bash" && typeof args.command === "string" ? pipelineHeads(args.command) : null;
				const isSearch = SEARCH_TOOLS.has(block.name) || (heads !== null && BASH_SEARCH.test(heads));
				const key = `${block.name} ${argumentKey(args)}`;
				const record = {
					id: block.id,
					tool: block.name,
					resultBytes: null,
					error: false,
					rejected: false,
					redundant: isSearch && searches.has(key),
					wrongTool: heads !== null && activeTools ? getBashAntiPatternHint(heads, [...activeTools]) : null,
					toolSetKnown: activeTools !== null,
				};
				if (isSearch) searches.add(key);
				if (MUTATING_TOOLS.has(block.name)) searches = new Set();
				calls.push(record);
				const searchBase = SEARCH_TOOLS.has(block.name) && typeof args.path === "string" ? args.path : null;
				const entry = { record, argsText: JSON.stringify(args), resultText: "", searchBase };
				byId.set(block.id, entry);
				if (task) {
					task.calls.push(entry);
					const path = args.path ?? args.file_path;
					if (block.name === "edit" && !task.edit && typeof path === "string") task.edit = { entry, path };
				}
			}
		} else if (message.role === "toolResult") {
			const entry = byId.get(message.toolCallId);
			if (!entry) continue;
			entry.resultText = textOf(message.content);
			entry.record.resultBytes = encoder.encode(entry.resultText).length;
			entry.record.error = message.isError === true;
			entry.record.rejected = entry.record.error && REJECTED.test(entry.resultText);
		}
	}
	closeTask();
	return { cwd, calls, tasks };
}

/** Nearest-rank percentile of sorted numbers. */
const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
const percentiles = (values) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return { p50: percentile(sorted, 50), p90: percentile(sorted, 90), p99: percentile(sorted, 99) };
};

/** Total scored sessions per tool. A call whose id an earlier session already holds (a fork's copied history) counts once. */
export function summarizeCorpus(scored) {
	const seen = new Set();
	const tools = new Map();
	const wrongTool = {};
	const touchCounts = [];
	const touchedBy = {};
	let calls = 0;
	let duplicates = 0;
	let unknownToolSet = 0;
	for (const session of scored) {
		const fresh = new Set();
		for (const call of session.calls) {
			if (seen.has(call.id)) { duplicates++; continue; }
			seen.add(call.id);
			fresh.add(call.id);
			calls++;
			if (!call.toolSetKnown) unknownToolSet++;
			const row = tools.get(call.tool) ?? { name: call.tool, calls: 0, errors: 0, rejected: 0, redundant: 0, wrongTool: 0, sizes: [] };
			tools.set(call.tool, row);
			row.calls++;
			row.errors += Number(call.error);
			row.rejected += Number(call.rejected);
			row.redundant += Number(call.redundant);
			if (call.resultBytes !== null) row.sizes.push(call.resultBytes);
			if (call.wrongTool) {
				row.wrongTool++;
				wrongTool[call.wrongTool] = (wrongTool[call.wrongTool] ?? 0) + 1;
			}
		}
		for (const task of session.tasks) {
			if (!fresh.has(task.editId)) continue;
			touchCounts.push(task.callsBeforeTouch);
			touchedBy[task.touchedBy] = (touchedBy[task.touchedBy] ?? 0) + 1;
		}
	}
	return {
		sessions: scored.length,
		calls,
		duplicates,
		unknownToolSet,
		tools: [...tools.values()]
			.sort((a, b) => b.calls - a.calls)
			.map(({ sizes, ...row }) => ({ ...row, bytes: sizes.length ? { ...percentiles(sizes), total: sizes.reduce((sum, size) => sum + size, 0) } : null })),
		wrongTool,
		tasks: { count: touchCounts.length, callsBeforeTouch: percentiles(touchCounts), touchedBy },
	};
}
