import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
const buildPendingEditPreviewDataSpy = vi.hoisted(() => vi.fn());
const generateDiffStringSpy = vi.hoisted(() => vi.fn());
const buildDiffDataSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/pending-diff-preview.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/pending-diff-preview.js")>();
	return {
		...actual,
		buildPendingEditPreviewData: (...args: Parameters<typeof actual.buildPendingEditPreviewData>) => {
			buildPendingEditPreviewDataSpy();
			return actual.buildPendingEditPreviewData(...args);
		},
	};
});

vi.mock("../src/edit-diff.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/edit-diff.js")>();
	return {
		...actual,
		generateDiffString: (...args: Parameters<typeof actual.generateDiffString>) => {
			generateDiffStringSpy();
			return actual.generateDiffString(...args);
		},
	};
});

vi.mock("../src/diff-data.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/diff-data.js")>();
	return {
		...actual,
		buildDiffData: (...args: Parameters<typeof actual.buildDiffData>) => {
			buildDiffDataSpy();
			return actual.buildDiffData(...args);
		},
	};
});

import { registerEditTool } from "../src/edit.js";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest } from "../src/hashline-settings.js";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

function getEditTool(): any {
	let tool: any;
	registerEditTool({ registerTool(def: any) { tool = def; } } as any);
	if (!tool) throw new Error("edit tool was not registered");
	return tool;
}

function textOf(component: any): string {
	return component?.text ?? component?.render?.(120)?.join("\n") ?? "";
}

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

describe("edit renderCall pending diff preview", () => {
	const originalEnv = process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
	beforeEach(() => {
		buildPendingEditPreviewDataSpy.mockClear();
		generateDiffStringSpy.mockClear();
		buildDiffDataSpy.mockClear();
		delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
		const root = join(tmpdir(), `edit-pending-render-${randomBytes(6).toString("hex")}`);
		__setHashlineSettingsPathsForTest({
			globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
			projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
		});
	});
	afterEach(() => {
		if (originalEnv === undefined) delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
		else process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = originalEnv;
		__resetHashlineSettingsPathsForTest();
	});
	it("does not project changing collapsed partial edit arguments", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-stream-repro-"));
		const filePath = resolve(cwd, "large.txt");
		writeFileSync(filePath, "target\n" + "unchanged line\n".repeat(500), "utf8");
		const tool = getEditTool();
		const context: any = { argsComplete: false, executionStarted: false, expanded: false, cwd, state: {}, invalidate: vi.fn() };

		for (const newText of ["replacement", "replacement grows", "replacement grows again"]) {
			tool.renderCall({
				path: filePath,
				edits: [{ replace: { old_text: "target", new_text: newText } }],
			}, theme, context);
		}

		expect(buildPendingEditPreviewDataSpy).not.toHaveBeenCalled();
		expect(generateDiffStringSpy).not.toHaveBeenCalled();
		expect(buildDiffDataSpy).not.toHaveBeenCalled();
	});

	it("keeps a complete collapsed edit preview lightweight", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-collapsed-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const unique = 1;\n", "utf-8");
		const tool = getEditTool();
		const context: any = { argsComplete: true, executionStarted: false, expanded: false, cwd, state: {}, invalidate: vi.fn() };
		const args = { path: filePath, edits: [{ replace: { old_text: "const unique = 1;", new_text: "const unique = 2;" } }] };

		const rendered = textOf(tool.renderCall(args, theme, context));

		expect(buildPendingEditPreviewDataSpy).not.toHaveBeenCalled();
		expect(generateDiffStringSpy).not.toHaveBeenCalled();
		expect(buildDiffDataSpy).not.toHaveBeenCalled();
		expect(rendered).toContain("edit");
		expect(rendered).toContain("pending edit");
		expect(rendered).toContain("Ctrl+O to expand");
		expect(rendered).not.toContain("↳ diff");
	});

	it("renders the full diff body when expanded", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-pending-expanded-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const unique = 1;\n", "utf-8");
		const tool = getEditTool();
		const context: any = { argsComplete: true, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: true };
		const args = { path: filePath, edits: [{ replace: { old_text: "const unique = 1;", new_text: "const unique = 2;" } }] };

		const first = tool.renderCall(args, theme, context);
		await Promise.resolve();
		const second = tool.renderCall(args, theme, { ...context, lastComponent: first });
		const rendered = textOf(second);

		expect(rendered).toContain("pending edit");
		expect(rendered).toContain("↳ diff +1 -1");
		expect(rendered).toContain("▌+ 1 │ const unique = 2;");
	});

	it("collapses the pending preview to just the call line once execution has started", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-exec-collapse-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const unique = 1;\n", "utf-8");
		const tool = getEditTool();
		const args = { path: filePath, edits: [{ replace: { old_text: "const unique = 1;", new_text: "const unique = 2;" } }] };

		// Before execution: pending preview with the full diff visible.
		const before: any = { argsComplete: true, executionStarted: false, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: true };
		const beforeFirst = tool.renderCall(args, theme, before);
		await Promise.resolve();
		const beforeSecond = tool.renderCall(args, theme, { ...before, lastComponent: beforeFirst });
		const beforeText = textOf(beforeSecond);
		expect(beforeText).toContain("pending edit");
		expect(beforeText).toContain("↳ diff +1 -1");

		// After execution starts: the call row drops the pending preview — renderResult will
		// carry the post-exec story (↳ edited +N -M with the same expandable diff).
		const after: any = { argsComplete: true, executionStarted: true, cwd, state: {}, invalidate: vi.fn(), lastComponent: undefined, expanded: true };
		const afterRendered = textOf(tool.renderCall(args, theme, after));
		expect(afterRendered).toContain("edit");
		expect(afterRendered).not.toContain("pending");
		expect(afterRendered).not.toContain("↳ diff +");
		expect(afterRendered).not.toContain("▌");
	});
});
