import { describe, it, expect } from "vitest";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildPendingEditPreviewData, buildPendingWritePreviewData } from "../src/pending-diff-preview.js";

function expectOk<T extends { type: string; reason?: string }>(preview: T): asserts preview is T & { type: "ok" } {
	if (preview.type !== "ok") throw new Error(`preview skipped: ${preview.reason ?? "unknown reason"}`);
}

describe("pending diff preview correctness regression", () => {
	it("previews an explicit absolute write path outside cwd", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-abs-write-repro-cwd-"));
		const outsideDir = mkdtempSync(resolve(tmpdir(), "pi-pending-abs-write-repro-outside-"));
		const outsideFile = resolve(outsideDir, "outside.txt");
		writeFileSync(outsideFile, "before\n", "utf-8");
		const realOutsideFile = realpathSync(outsideFile);

		const preview = buildPendingWritePreviewData({ path: outsideFile, content: "after\n" }, cwd);

		expectOk(preview);
		expect(preview.data.headerLabel).toBe("pending overwrite");
		expect(preview.data.filePath).toBe(realOutsideFile);
		expect(preview.data.nextContent).toBe("after\n");
	});

	it("previews an explicit absolute create path outside cwd", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-abs-create-repro-cwd-"));
		const outsideDir = mkdtempSync(resolve(tmpdir(), "pi-pending-abs-create-repro-outside-"));
		const outsideFile = resolve(outsideDir, "created.txt");

		const preview = buildPendingWritePreviewData({ path: outsideFile, content: "created\n" }, cwd);

		expectOk(preview);
		expect(preview.data.headerLabel).toBe("pending create");
		expect(preview.data.fileExistedBeforeWrite).toBe(false);
		expect(preview.data.filePath).toBe(outsideFile);
		expect(preview.data.previousContent).toBe("");
		expect(preview.data.nextContent).toBe("created\n");
	});

	it("skips previewing an ambiguous plain replace, which execution refuses", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-replace-first-repro-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const one = 1;\nconst two = 2;\n", "utf-8");

		const preview = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ replace: { old_text: "const", new_text: "let" } }],
		}, cwd);

		expect(preview).toEqual({ type: "skip", reason: "replace old_text occurs more than once" });
	});

	it("previews replace with all:true across repeated matches", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-replace-all-repro-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const one = 1;\nconst two = 2;\n", "utf-8");

		const preview = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ replace: { old_text: "const", new_text: "let", all: true } }],
		}, cwd);

		expectOk(preview);
		expect(preview.data.nextContent).toBe("let one = 1;\nlet two = 2;\n");
	});

	it("previews replace with fuzzy:true when exact text is absent", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-replace-fuzzy-repro-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "alpha   \n beta\n gamma\n", "utf-8");

		const preview = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ replace: { old_text: "alpha\n beta\n gamma\n", new_text: "alpha\n", fuzzy: true } }],
		}, cwd);

		expectOk(preview);
		expect(preview.data.nextContent).toBe("alpha\n");
	});
});
