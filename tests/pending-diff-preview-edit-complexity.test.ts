import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

function unrelatedContent(prefix: string): string {
	return Array.from({ length: 1001 }, (_, index) => `${prefix}-${index}`).join("\n") + "\n";
}

describe("pending edit preview complexity", () => {
	it("falls back before generating a high-complexity pending edit diff", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-edit-complexity-"));
		const filePath = resolve(cwd, "sample.txt");
		const oldContent = unrelatedContent("old");
		const newContent = unrelatedContent("new");
		writeFileSync(filePath, oldContent, "utf8");

		const preview = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ replace: { old_text: oldContent, new_text: newContent } }],
		}, cwd);

		expect(preview.type).toBe("skip");
		if (preview.type !== "skip") throw new Error("complex edit preview unexpectedly projected");
		expect(preview.reason).toBe("diff too complex");
	});
});
