import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractSnapshot, TASKS } from "../scripts/bench/locate-tasks/tasks.mjs";

let scratch: string;
let pristine: string;
let snapshotNames: string[];

function listFiles(root: string): string[] {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));
}

beforeAll(() => {
	scratch = mkdtempSync(join(tmpdir(), "locate-tasks-"));
	pristine = join(scratch, "pristine");
	extractSnapshot(pristine);
	snapshotNames = [...new Set(listFiles(pristine).map((path) => basename(path)).filter((name) => /\w\.\w/.test(name)))];
}, 60_000);

afterAll(() => {
	if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe("locate-first tasks", () => {
	it("number about ten, with unique ids", () => {
		expect(TASKS.length).toBeGreaterThanOrEqual(8);
		expect(TASKS.length).toBeLessThanOrEqual(12);
		expect(new Set(TASKS.map((task) => task.id)).size).toBe(TASKS.length);
	});

	it("extract the pinned snapshot verbatim", () => {
		expect(listFiles(pristine).length).toBe(856);
	});

	describe.each(TASKS.map((task) => [task.id, task] as const))("%s", (_id, task) => {
		it("names a behaviour in its prompt, never a snapshot file", () => {
			const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const named = snapshotNames.filter((name) => new RegExp(`(^|[^\\w.-])${escape(name)}($|[^\\w.-])`, "i").test(task.prompt));
			expect(named).toEqual([]);
			expect(task.prompt).not.toMatch(/\b(src|tests|scripts|prompts|docs)\//);
		});

		it("fails its checker on the untouched snapshot", async () => {
			expect(await task.check(pristine)).not.toEqual([]);
		});

		it("passes its checker after the reference solution", async () => {
			const workspace = join(scratch, task.id);
			cpSync(pristine, workspace, { recursive: true });
			task.solve(workspace);
			expect(await task.check(workspace)).toEqual([]);
		});
	});

	const edit = (root: string, path: string, from: string, to: string) => {
		const text = readFileSync(join(root, path), "utf8");
		if (!text.includes(from)) throw new Error(`${path} lacks ${from}`);
		writeFileSync(join(root, path), text.replace(from, to));
	};
	const wrongAnswers: Array<[string, string, (root: string) => void]> = [
		["rename-format-not-found", "renamed at its definition only", (root) => edit(root, "src/readmap/symbol-error-format.ts", "formatNotFound", "formatMissingSymbol")],
		["ls-default-limit", "code changed, documentation left at 500", (root) => edit(root, "src/ls.ts", "DEFAULT_LIMIT = 500", "DEFAULT_LIMIT = 1000")],
		["outline-script-license", "a Python helper given a // comment", (root) => {
			TASKS.find((task) => task.id === "outline-script-license")!.solve(root);
			edit(root, "scripts/python_outline.py", "# SPDX", "// SPDX");
		}],
		["markdown-map-cache-version", "the Markdown version declaration deleted", (root) => edit(root, "src/readmap/mappers/markdown.ts", "export const MAPPER_VERSION = 1;", "")],
		["markdown-map-cache-version", "another mapper bumped too", (root) => {
			edit(root, "src/readmap/mappers/markdown.ts", "MAPPER_VERSION = 1", "MAPPER_VERSION = 2");
			edit(root, "src/readmap/mappers/yaml.ts", "MAPPER_VERSION = 1", "MAPPER_VERSION = 2");
		}],
	];

	it.each(wrongAnswers)("%s refuses a wrong answer: %s", async (id, _label, apply) => {
		const workspace = mkdtempSync(join(scratch, `wrong-${id}-`));
		cpSync(pristine, workspace, { recursive: true });
		apply(workspace);
		expect(await TASKS.find((task) => task.id === id)!.check(workspace)).not.toEqual([]);
	});
});
