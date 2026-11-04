#!/usr/bin/env node
/**
 * What each tool costs in context: its provider-visible declaration bytes and estimated tokens.
 *
 * Usage:
 *   node scripts/bench/tool-cost.mjs [--declarations] [--sessions <dir>] [--json]
 *
 * --declarations (the default) loads this checkout's index.ts alone into the selected host
 * (PI_COMPAT_HOST, else the locked Pi) through createAgentSession, sends one prompt to a stub
 * provider and reads what it receives: the rendered system prompt and the tool declarations.
 * Each tool is charged its declaration ({name, description, parameters} as JSON), its
 * `- name: snippet` line and its guideline lines; the rest of the system prompt is shared.
 * Bytes are UTF-8; tokens are characters / 4, an estimate, not a provider tokenizer. Then it
 * lists each provider-visible text of one tool that names another declared tool.
 *
 * --sessions <dir> scores every Pi session file under dir (such as ~/.pi/agent/sessions) with
 * confusion.mjs: per tool its calls, result bytes and confusion signals, and per task the calls
 * before the edited file is first named. Alone it skips the declarations; add --declarations for both.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { selectCompatHost } from "../pi-compat-host.mjs";
import { scoreSession, summarizeCorpus } from "./confusion.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const encoder = new TextEncoder();
const measure = (texts) => {
	const chars = texts.reduce((sum, text) => sum + text.length, 0);
	return { bytes: texts.reduce((sum, text) => sum + encoder.encode(text).length, 0), chars };
};
const tokens = (chars) => Math.round(chars / 4);
const declarationOf = ({ name, description, parameters }) => JSON.stringify({ name, description, parameters });

/** Charge each tool its declaration, snippet line and guideline lines; the rest of the system prompt is shared. */
export function accountDeclarations({ systemPrompt, tools, prompts }) {
	const lines = systemPrompt.split("\n");
	const charged = new Set();
	const chargeLine = (line, what) => {
		const free = lines.findIndex((candidate, index) => candidate === line && !charged.has(index));
		if (free === -1) {
			// Pi renders a guideline shared by two tools once; the first tool declaring it pays for it.
			if (lines.includes(line)) return [];
			throw new Error(`${what} not found in the system prompt: ${line}`);
		}
		charged.add(free);
		return [`${line}\n`];
	};
	const rows = tools.map((tool) => {
		const { snippet, guidelines = [] } = prompts[tool.name] ?? {};
		const declaration = measure([declarationOf(tool)]);
		const snippetLines = snippet ? chargeLine(`- ${tool.name}: ${snippet}`, `${tool.name} snippet`) : [];
		const guidelineLines = guidelines.flatMap((guideline) => chargeLine(`- ${guideline}`, `${tool.name} guideline`));
		const snippetPart = measure(snippetLines);
		const guidelinePart = measure(guidelineLines);
		const chars = declaration.chars + snippetPart.chars + guidelinePart.chars;
		return {
			name: tool.name,
			declarationBytes: declaration.bytes,
			snippetBytes: snippetPart.bytes,
			guidelineBytes: guidelinePart.bytes,
			bytes: declaration.bytes + snippetPart.bytes + guidelinePart.bytes,
			chars,
			tokens: tokens(chars),
		};
	});
	const prompt = measure([systemPrompt]);
	const chargedPrompt = measure([...charged].map((index) => `${lines[index]}\n`));
	const shared = { bytes: prompt.bytes - chargedPrompt.bytes, chars: prompt.chars - chargedPrompt.chars };
	const total = rows.reduce((sum, row) => ({ bytes: sum.bytes + row.bytes, chars: sum.chars + row.chars }), shared);
	return {
		tools: rows,
		shared: { bytes: shared.bytes, tokens: tokens(shared.chars) },
		total: { bytes: total.bytes, tokens: tokens(total.chars) },
	};
}

function parameterDescriptions(node, path = "$", out = []) {
	if (!node || typeof node !== "object") return out;
	if (typeof node.description === "string") out.push([path, node.description]);
	for (const [key, child] of Object.entries(node)) {
		if (Array.isArray(child)) child.forEach((item, index) => parameterDescriptions(item, `${path}.${key}[${index}]`, out));
		else if (child && typeof child === "object") parameterDescriptions(child, `${path}.${key}`, out);
	}
	return out;
}

/** Each provider-visible text of one tool naming another declared tool, as a whole case-sensitive word. */
export function findCrossReferences({ tools, prompts }) {
	const names = tools.map((tool) => tool.name);
	const named = (text, own) => names.filter((name) => name !== own && new RegExp(`\\b${name}\\b`).test(text));
	return tools.flatMap((tool) => {
		const { snippet, guidelines = [] } = prompts[tool.name] ?? {};
		const texts = [
			["description", tool.description],
			...parameterDescriptions(tool.parameters),
			...(snippet ? [["snippet", snippet]] : []),
			...guidelines.map((guideline) => ["guideline", guideline]),
		];
		return texts.flatMap(([where, text]) => {
			const hits = named(text, tool.name);
			return hits.length ? [{ tool: tool.name, where, names: hits, text }] : [];
		});
	});
}

export function formatDeclarationReport({ host, version, tools, shared, total, crossReferences }) {
	const width = Math.max(20, ...tools.map((tool) => tool.name.length));
	const row = (cells) => cells.map((cell, index) => (index === 0 ? String(cell).padEnd(width) : String(cell).padStart(11))).join(" ").trimEnd();
	return [
		`Pi ${version} (${host}), this extension alone, every declared tool active`,
		"bytes are UTF-8; tokens are characters / 4, an estimate",
		"",
		row(["tool", "declaration", "snippet", "guidelines", "bytes", "~tokens"]),
		...tools.map((tool) => row([tool.name, tool.declarationBytes, tool.snippetBytes, tool.guidelineBytes, tool.bytes, tool.tokens])),
		row(["shared system prompt", "", "", "", shared.bytes, shared.tokens]),
		row(["total", "", "", "", total.bytes, total.tokens]),
		"",
		"Text in one tool naming another:",
		...crossReferences.map((ref) => `${ref.tool} ${ref.where} names ${ref.names.join(", ")}: ${ref.text}`),
	].join("\n");
}

/** Load index.ts alone into the selected host and capture what its provider receives for one prompt. */
export async function captureDeclarations() {
	const { host, version } = selectCompatHost();
	const hostRequire = createRequire(join(host, "package.json"));
	// pi-ai exports only an import condition, so require.resolve cannot find its entry: locate the package directory.
	const piAiDir = hostRequire.resolve.paths("@earendil-works/pi-ai")
		.map((dir) => join(dir, "@earendil-works/pi-ai"))
		.find((dir) => existsSync(join(dir, "package.json")));
	const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(pathToFileURL(join(host, "dist/index.js")).href);
	const piAi = await import(pathToFileURL(join(piAiDir, "dist/compat.js")).href);
	const cwd = mkdtempSync(join(tmpdir(), "tool-cost-cwd-"));
	const agentDir = mkdtempSync(join(tmpdir(), "tool-cost-agent-"));
	const api = "tool-cost-capture";
	const faux = piAi.registerFauxProvider({ api, provider: api, models: [{ id: "capture" }] });
	let context;
	faux.setResponses([(received) => { context = received; return piAi.fauxAssistantMessage("ok"); }]);
	// An extension provider resolves auth through the session's model runtime, which a bare faux model lacks.
	const stubProvider = (pi) => pi.registerProvider(api, {
		baseUrl: "http://127.0.0.1:9", apiKey: "unused", api,
		models: [{ id: "capture", name: "capture", reasoning: false, input: ["text"], contextWindow: 200_000, maxTokens: 8192, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
	});
	let session;
	try {
		const resourceLoader = new DefaultResourceLoader({
			cwd, agentDir, noExtensions: true, additionalExtensionPaths: [join(REPO, "index.ts")], extensionFactories: [stubProvider],
			noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
		});
		await resourceLoader.reload();
		({ session } = await createAgentSession({ cwd, agentDir, resourceLoader, sessionManager: SessionManager.inMemory(cwd) }));
		await session.setModel(session.modelRuntime.getModel(api, "capture"));
		await session.prompt("Reply ok.");
		if (!context) throw new Error("the stub provider received no request");
		const tools = piAi.getCurrentTools(context.messages);
		const prompts = Object.fromEntries(tools.map(({ name }) => {
			const definition = session.getToolDefinition(name);
			const trimmed = (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
			return [name, {
				snippet: trimmed(definition?.promptSnippet),
				guidelines: (definition?.promptGuidelines ?? []).map(trimmed).filter(Boolean),
			}];
		}));
		return { host, version, systemPrompt: piAi.getCurrentSystemPrompt(context.messages), tools, prompts };
	} finally {
		session?.dispose();
		faux.unregister();
		rmSync(cwd, { recursive: true, force: true });
		rmSync(agentDir, { recursive: true, force: true });
	}
}

/** Score every `.jsonl` session file under `dir`, oldest first by file name, so a fork follows its parent. */
export function scanSessions(dir) {
	const files = readdirSync(dir, { recursive: true })
		.map(String)
		.filter((name) => name.endsWith(".jsonl"))
		.sort((a, b) => basename(a).localeCompare(basename(b)) || a.localeCompare(b));
	return { dir: resolve(dir), ...summarizeCorpus(files.map((name) => scoreSession(readFileSync(join(dir, name), "utf8")))) };
}

export function formatSessionReport({ dir, sessions, calls, duplicates, unknownToolSet, tools, wrongTool, tasks }) {
	const width = Math.max(10, ...tools.map((tool) => tool.name.length));
	const row = (cells) => cells.map((cell, index) => (index === 0 ? String(cell).padEnd(width) : String(cell).padStart(10))).join(" ").trimEnd();
	const counts = (record) => Object.entries(record).sort((a, b) => b[1] - a[1]);
	const spread = (p) => (p ? `p50 ${p.p50}, p90 ${p.p90}, p99 ${p.p99}` : "none");
	return [
		`${sessions} session files under ${dir}: ${calls} tool calls, ${duplicates} more copied from a forked parent and counted once`,
		`${unknownToolSet} calls have no recorded tool set, so no wrong-tool score`,
		"result bytes are UTF-8 of the result's text blocks",
		"",
		row(["tool", "calls", "errors", "rejected", "redundant", "wrong-tool", "bytes p50", "p90", "p99", "total"]),
		...tools.map((tool) => row([
			tool.name, tool.calls, tool.errors, tool.rejected, tool.redundant, tool.wrongTool,
			...(tool.bytes ? [tool.bytes.p50, tool.bytes.p90, tool.bytes.p99, tool.bytes.total] : ["", "", "", ""]),
		])),
		"",
		"Wrong-tool picks, by the hint bash would add:",
		...counts(wrongTool).map(([hint, count]) => `${String(count).padStart(8)}  ${hint}`),
		"",
		`Tasks with an edit: ${tasks.count}; tool calls before the first naming the edited file: ${spread(tasks.callsBeforeTouch)}`,
		`First named by: ${counts(tasks.touchedBy).map(([tool, count]) => `${tool} ${count}`).join(", ")}`,
	].join("\n");
}

const USAGE = "usage: node scripts/bench/tool-cost.mjs [--declarations] [--sessions <dir>] [--json]";

async function main(args) {
	const sessionsAt = args.indexOf("--sessions");
	const sessionsDir = sessionsAt === -1 ? null : args[sessionsAt + 1];
	const rest = sessionsAt === -1 ? args : args.filter((_arg, index) => index !== sessionsAt && index !== sessionsAt + 1);
	const unknown = rest.filter((arg) => arg !== "--declarations" && arg !== "--json");
	if (unknown.length || (sessionsAt !== -1 && (!sessionsDir || sessionsDir.startsWith("--")))) {
		console.error(`${unknown.length ? `unknown argument: ${unknown.join(" ")}` : "--sessions needs a directory"}\n${USAGE}`);
		process.exit(2);
	}
	const declarations = !sessionsDir || rest.includes("--declarations");
	let report = {};
	if (declarations) {
		const capture = await captureDeclarations();
		report = { host: capture.host, version: capture.version, ...accountDeclarations(capture), crossReferences: findCrossReferences(capture) };
	}
	if (sessionsDir) report.sessions = scanSessions(sessionsDir);
	if (rest.includes("--json")) console.log(JSON.stringify(report, null, 2));
	else console.log([
		...(declarations ? [formatDeclarationReport(report)] : []),
		...(sessionsDir ? [formatSessionReport(report.sessions)] : []),
	].join("\n\n"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
