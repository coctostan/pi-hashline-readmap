import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildPendingWritePreviewData } from "../src/pending-diff-preview.js";
import { executeWrite } from "../src/write.js";

function unrelatedContent(prefix: string): string {
	return Array.from({ length: 1001 }, (_, index) => `${prefix}-${index}`).join("\n") + "\n";
}

describe("pending write preview complexity", () => {
	it("falls back from pending detail without blocking authoritative write output", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-write-complexity-"));
		const filePath = resolve(cwd, "sample.txt");
		const oldContent = unrelatedContent("old");
		const newContent = unrelatedContent("new");
		writeFileSync(filePath, oldContent, "utf8");

		const preview = buildPendingWritePreviewData({ path: filePath, content: newContent }, cwd);
		expect(preview.type).toBe("skip");
		if (preview.type !== "skip") throw new Error("complex write preview unexpectedly projected");
		expect(preview.reason).toBe("diff too complex");

		const result = await executeWrite({ path: filePath, content: newContent, cwd });
		expect(readFileSync(filePath, "utf8")).toBe(newContent);
		expect(result.diff).toContain("-   1 old-0");
		expect(result.diff).toContain("+   1 new-0");
		expect(result.diffData).toBeDefined();
		expect(result.diffData?.stats).toEqual({ added: 1001, removed: 1001, context: 0 });
		expect(result.ptcValue.diff).toBe(result.diff);
		expect(result.ptcValue.diffData).toEqual(result.diffData);
	});
});
