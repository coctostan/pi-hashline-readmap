import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const buildPendingWritePreviewDataSpy = vi.hoisted(() => vi.fn());
const generateDiffStringSpy = vi.hoisted(() => vi.fn());
const buildDiffDataSpy = vi.hoisted(() => vi.fn());

vi.mock("../src/pending-diff-preview.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/pending-diff-preview.js")>();
	return {
		...actual,
		buildPendingWritePreviewData: (...args: Parameters<typeof actual.buildPendingWritePreviewData>) => {
			buildPendingWritePreviewDataSpy();
			return actual.buildPendingWritePreviewData(...args);
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

import { registerWriteTool } from "../src/write.js";

const theme = {
	fg: (_style: string, text: string) => text,
	bold: (text: string) => text,
};

function registeredWriteTool(): any {
	let tool: any;
	registerWriteTool({ registerTool(definition: any) { tool = definition; } } as any);
	if (!tool) throw new Error("tool was not registered");
	return tool;
}

describe("issue 221: streamed pending previews", () => {
	it("does not project changing partial write arguments at either expansion state", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-write-stream-repro-"));
		writeFileSync(resolve(cwd, "large.txt"), "unrelated old line\n".repeat(500), "utf8");
		const tool = registeredWriteTool();
		const chunks = ["new line 1\n", "new line 1\nnew line 2\n", "new line 1\nnew line 2\nnew line 3\n"];

		for (const expanded of [false, true]) {
			buildPendingWritePreviewDataSpy.mockClear();
			generateDiffStringSpy.mockClear();
			buildDiffDataSpy.mockClear();
			const context = { argsComplete: false, executionStarted: false, expanded, cwd, state: {} };
			for (const content of chunks) {
				tool.renderCall({ path: "large.txt", content }, theme, context);
			}
			expect(buildPendingWritePreviewDataSpy).not.toHaveBeenCalled();
			expect(generateDiffStringSpy).not.toHaveBeenCalled();
			expect(buildDiffDataSpy).not.toHaveBeenCalled();
		}
	});
});
