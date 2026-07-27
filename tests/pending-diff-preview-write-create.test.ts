import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const generateDiffStringSpy = vi.hoisted(() => vi.fn());

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

import { buildPendingWritePreviewData } from "../src/pending-diff-preview.js";

describe("pending write create preview", () => {
	it("projects create content without invoking the line diff algorithm", () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-write-create-"));

		const created = buildPendingWritePreviewData({ path: "created.txt", content: "created value\n" }, cwd);

		expect(created.type).toBe("ok");
		if (created.type !== "ok") throw new Error(created.reason);
		expect(created.data.headerLabel).toBe("pending create");
		expect(created.data.fileExistedBeforeWrite).toBe(false);
		expect(created.data.previousContent).toBe("");
		expect(created.data.nextContent).toBe("created value\n");
		expect(created.data.diff).toBe("");
		expect(generateDiffStringSpy).not.toHaveBeenCalled();
	});
});
