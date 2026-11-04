import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
});
