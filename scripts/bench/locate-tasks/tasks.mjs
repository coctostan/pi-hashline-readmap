/**
 * Locate-first tasks for the tools-vs-bash A/B: each prompt names a behaviour of this repo, never a
 * file, so the model must find where that behaviour lives before it can change it. Every task runs
 * on the same pinned snapshot, has a reference solution, and a checker that returns its failures
 * (empty = pass). Checkers call the snapshot's own pure modules where a behaviour can be called.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { createJiti } from "jiti";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** main before these tasks existed, so neither the tasks nor their answers are in it. */
export const SNAPSHOT = "06f775188a9d88496fb1bef2d54ba1b77aaf85ef";

export function extractSnapshot(dir) {
	mkdirSync(dir, { recursive: true });
	const archive = execFileSync("git", ["-C", REPO, "archive", SNAPSHOT], { maxBuffer: 512 * 1024 * 1024 });
	execFileSync("tar", ["-x", "-C", dir], { input: archive });
}

function snapshotFile(path) {
	return execFileSync("git", ["-C", REPO, "show", `${SNAPSHOT}:${path}`], { encoding: "utf8" });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const read = (root, path) => readFileSync(join(root, path), "utf8");

/** Replace `from` in a snapshot file; it must occur exactly once, so a drifted reference fails loudly. */
function replace(root, path, from, to) {
	const text = read(root, path);
	const count = text.split(from).length - 1;
	if (count !== 1) throw new Error(`${path}: expected one ${JSON.stringify(from)}, found ${count}`);
	writeFileSync(join(root, path), text.replace(from, () => to));
}

/** A fresh import of a snapshot TypeScript module, so each check sees the workspace as it is. */
function load(root, path) {
	return createJiti(import.meta.url, { moduleCache: false, fsCache: false }).import(join(root, path));
}

/** Failures for each `[label, got, want]` whose values differ. */
function compare(cases) {
	return cases
		.filter(([, got, want]) => !isDeepStrictEqual(got, want))
		.map(([label, got, want]) => `${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

function codeFiles(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.[cm]?[jt]s$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1));
}

const nonBlankLines = (text) => text.split("\n").filter((line) => line.trim());
const mapperVersion = (text) => Number(text.match(/MAPPER_VERSION\s*=\s*(\d+)/)?.[1]);

// ─── Tasks ──────────────────────────────────────────────────────────────────

/** Each outline helper with its language's comment prefix. */
const OUTLINE_SCRIPTS = { "scripts/python_outline.py": "#", "scripts/gdscript_outline.py": "#", "scripts/go_outline.go": "//" };
const spdxLine = (prefix) => new RegExp(`^\\s*${prefix}\\s*SPDX-License-Identifier:\\s*MIT\\s*$`);
const MAPPERS_DIR = "src/readmap/mappers";

const tasks = [
	{
		id: "ansi-cursor-codes",
		prompt: "After bash output has its ANSI escape codes stripped, cursor codes such as `\\x1b[?25l` (hide cursor) and `\\x1b[?25h` (show cursor) are still left in the text. Fix whatever strips the codes so these are removed too, and keep removing colour codes.",
		solve: (root) => replace(root, "src/ansi.ts", String.raw`/\x1b\[[0-9;]*[a-zA-Z]/g`, String.raw`/\x1b\[[0-9;?]*[a-zA-Z]/g`),
		check: async (root) => {
			const { stripAnsi } = await load(root, "src/ansi.ts");
			return compare([
				["cursor codes", stripAnsi("\x1b[?25lhi\x1b[?25h"), "hi"],
				["colour codes", stripAnsi("\x1b[1;31mred\x1b[0m"), "red"],
				["OSC title", stripAnsi("\x1b]0;title\x07done"), "done"],
			]);
		},
	},
	{
		id: "rename-format-not-found",
		prompt: "Rename the function that formats the warning for a requested symbol that isn't found to `formatMissingSymbol`, wherever it is defined, imported or called.",
		solve: (root) => {
			for (const path of ["src/readmap/symbol-error-format.ts", "src/read.ts", "src/replace-symbol.ts"]) {
				writeFileSync(join(root, path), read(root, path).replace(/\bformatNotFound\b/g, "formatMissingSymbol"));
			}
		},
		check: async (root) => {
			const failures = codeFiles(root)
				.filter((path) => /\bformatNotFound\b/.test(read(root, path)))
				.map((path) => `${path} still names formatNotFound`);
			for (const path of ["src/read.ts", "src/replace-symbol.ts"]) {
				if (!/\bformatMissingSymbol\(/.test(read(root, path))) failures.push(`${path} does not call formatMissingSymbol`);
			}
			const { formatMissingSymbol } = await load(root, "src/readmap/symbol-error-format.ts");
			const warning = typeof formatMissingSymbol === "function" ? formatMissingSymbol("beta", { symbols: [{ name: "alpha" }] }) : undefined;
			return [...failures, ...compare([["formatMissingSymbol warns", /not found/.test(String(warning)), true]])];
		},
	},
	{
		id: "markdown-extension",
		prompt: "Language detection doesn't recognise files ending in `.markdown`, so they aren't treated as Markdown the way `.md` files are. Make it recognise them.",
		solve: (root) => {
			const mdx = `  ".mdx": { id: "markdown", name: "Markdown" },\n`;
			replace(root, "src/readmap/language-detect.ts", mdx, `${mdx}  ".markdown": { id: "markdown", name: "Markdown" },\n`);
		},
		check: async (root) => {
			const { detectLanguage } = await load(root, "src/readmap/language-detect.ts");
			const markdown = { id: "markdown", name: "Markdown" };
			return compare([
				[".markdown", detectLanguage("notes.markdown"), markdown],
				[".md", detectLanguage("notes.md"), markdown],
				[".txt", detectLanguage("notes.txt"), null],
			]);
		},
	},
	{
		id: "ls-default-limit",
		prompt: "When the ls tool is called without a limit it returns at most 500 entries. Raise that default to 1000, and keep the default the tool documents to the model accurate.",
		solve: (root) => {
			replace(root, "src/ls.ts", "const DEFAULT_LIMIT = 500;", "const DEFAULT_LIMIT = 1000;");
			replace(root, "prompts/ls.md", "default 500", "default 1000");
		},
		// shortcut: matches text, since calling the ls tool needs Pi's packages in the workspace; call it if a valid answer is refused.
		check: async (root) => {
			const code = read(root, "src/ls.ts");
			const doc = read(root, "prompts/ls.md");
			return compare([
				["code default is 1000", /DEFAULT_LIMIT\s*=\s*1_?000\s*;/.test(code), true],
				["documented default is 1000", /default\s+1[,_]?000\b/i.test(doc), true],
				["500 no longer documented", /default\s+500\b/i.test(doc), false],
			]);
		},
	},
	{
		id: "bash-search-hint-commands",
		prompt: "The hint the bash tool appends when a command searches file contents with `grep` or `rg` should also appear for `ag` and `ugrep` commands.",
		solve: (root) => replace(
			root,
			"src/bash-anti-pattern-hints.ts",
			`hasCommand(command, "grep") || hasCommand(command, "rg")`,
			`["grep", "rg", "ag", "ugrep"].some((name) => hasCommand(command, name))`,
		),
		check: async (root) => {
			const { getBashAntiPatternHint: hint } = await load(root, "src/bash-anti-pattern-hints.ts");
			const searchHint = hint("rg needle src", ["grep"]);
			return compare([
				["rg still hinted", typeof searchHint === "string" && searchHint.includes("grep"), true],
				["ag", hint("ag needle src", ["grep"]), searchHint],
				["ugrep", hint("ugrep -n needle .", ["grep"]), searchHint],
				["ag with grep inactive", hint("ag needle src", []), null],
				["a word ending in ag", hint("echo diag", ["grep"]), null],
			]);
		},
	},
	{
		id: "integer-plus-sign",
		prompt: "Integer tool arguments such as `limit` accept a numeric string like \"12\" but reject \"+12\" with `Invalid limit: expected a base-10 integer`. Accept a leading plus sign, and keep rejecting strings that are not integers.",
		solve: (root) => replace(root, "src/coerce-obvious-int.ts", String.raw`/^-?\d+$/`, String.raw`/^[-+]?\d+$/`),
		check: async (root) => {
			const { coerceObviousBase10Int: coerce } = await load(root, "src/coerce-obvious-int.ts");
			return compare([
				["+12 with a name", coerce("+12", "limit"), { ok: true, value: 12 }],
				["+12 without a name", coerce("+12"), 12],
				["12", coerce("12", "limit"), { ok: true, value: 12 }],
				["-3", coerce("-3", "limit"), { ok: true, value: -3 }],
				["1.5 rejected", coerce("1.5", "limit").ok, false],
				["+ rejected", coerce("+", "limit").ok, false],
				["+-1 rejected", coerce("+-1", "limit").ok, false],
			]);
		},
	},
	{
		id: "find-stat-concurrency",
		prompt: "The find tool stats up to 32 files at a time. Lower that cap to 16.",
		solve: (root) => replace(root, "src/find-stat.ts", "DEFAULT_STAT_CONCURRENCY = 32;", "DEFAULT_STAT_CONCURRENCY = 16;"),
		check: async (root) => {
			const mod = await load(root, "src/find-stat.ts");
			const peak = async (concurrency) => {
				let inFlight = 0;
				let max = 0;
				mod._testable.stat = async () => {
					max = Math.max(max, ++inFlight);
					await new Promise((done) => setImmediate(done));
					inFlight--;
					return null;
				};
				await mod.statAllWithConcurrency(Array.from({ length: 100 }, (_, i) => `f${i}`), root, concurrency);
				return max;
			};
			return compare([
				["default", await peak(undefined), 16],
				["asked for 64", await peak(64), 16],
				["asked for 4", await peak(4), 4],
			]);
		},
	},
	{
		id: "outline-script-license",
		prompt: "Add an `SPDX-License-Identifier: MIT` comment, in each file's own comment syntax, near the top of every helper program the structural map runs to outline source files (not the TypeScript mappers that run them). Change nothing else in them.",
		solve: (root) => {
			for (const [path, prefix] of Object.entries(OUTLINE_SCRIPTS)) {
				const text = read(root, path);
				const header = `${prefix} SPDX-License-Identifier: MIT\n`;
				writeFileSync(join(root, path), text.startsWith("#!") ? text.replace(/^(#!.*\n)/, `$1${header}`) : header + text);
			}
		},
		check: async (root) => Object.entries(OUTLINE_SCRIPTS).flatMap(([path, prefix]) => {
			const text = read(root, path);
			const spdx = spdxLine(prefix);
			return compare([
				[`${path} has the identifier near the top`, text.split("\n").slice(0, 5).some((line) => spdx.test(line)), true],
				[`${path} is otherwise unchanged`, nonBlankLines(text).filter((line) => !spdx.test(line)).join("\n") === nonBlankLines(snapshotFile(path)).join("\n"), true],
			]);
		}),
	},
	{
		id: "markdown-map-cache-version",
		prompt: "The Markdown structural map's output shape changed, so maps cached in the old shape must be invalidated. Bump the Markdown mapper's cache version, and no other mapper's.",
		solve: (root) => replace(root, `${MAPPERS_DIR}/markdown.ts`, "MAPPER_VERSION = 1;", "MAPPER_VERSION = 2;"),
		// The inventory comes from the snapshot, so a deleted file or declaration fails rather than drops out.
		check: async (root) => compare(
			snapshotFile(`${MAPPERS_DIR}/`).split("\n").filter((name) => name.endsWith(".ts"))
				.map((name) => `${MAPPERS_DIR}/${name}`)
				.map((path) => [path, mapperVersion(snapshotFile(path))])
				.filter(([, before]) => !Number.isNaN(before))
				.map(([path, before]) => [path, mapperVersion(read(root, path)), path.endsWith("/markdown.ts") ? before + 1 : before]),
		),
	},
	{
		id: "ast-search-loop-suggestion",
		prompt: "When the agent keeps repeating the same `ast_search` call, the warning it gets suggests things to try. Add \"try a narrower path\" to those ast_search suggestions, keeping the existing ones.",
		solve: (root) => {
			const last = `    "verify ast-grep is installed",\n`;
			replace(root, "src/doom-loop-suggestions.ts", last, `${last}    "try a narrower path",\n`);
		},
		check: async (root) => {
			const { SUGGESTIONS } = await load(root, "src/doom-loop-suggestions.ts");
			const list = SUGGESTIONS?.ast_search ?? [];
			return compare(
				["try a narrower path", 'check the lang parameter matches file type (e.g. lang: "tsx" for JSX)', "simplify the pattern with $_ or $$$ wildcards", "verify ast-grep is installed"]
					.map((suggestion) => [`suggests ${JSON.stringify(suggestion)}`, list.includes(suggestion), true]),
			);
		},
	},
];

/** Each task, its checker turned total: a throw (a syntax error the model left, a missing export) is a failure. */
export const TASKS = tasks.map((task) => ({
	...task,
	check: async (root) => {
		try {
			return await task.check(root);
		} catch (error) {
			return [`checker threw: ${error instanceof Error ? error.message : String(error)}`];
		}
	},
}));
