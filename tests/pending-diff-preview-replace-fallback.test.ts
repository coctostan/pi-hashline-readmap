import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

function makeFixture(content: string): { cwd: string; filePath: string } {
	const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-replace-first-"));
	const filePath = resolve(cwd, "sample.ts");
	writeFileSync(filePath, content, "utf-8");
	return { cwd, filePath };
}

describe("pending edit replace preview", () => {
	it("does not project an ambiguous plain replace", async () => {
		const { cwd, filePath } = makeFixture("const one = 1;\nconst two = 2;\n");

		const preview = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ replace: { old_text: "const", new_text: "let" } }],
		}, cwd);

		expect(preview).toEqual({ type: "skip", reason: "replace old_text occurs more than once" });
	});
});
