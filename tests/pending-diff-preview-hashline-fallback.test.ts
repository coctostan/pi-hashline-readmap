import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

describe("pending hashline edit fallback", () => {
	beforeAll(async () => {
	});

	it("skips an out-of-range anchor", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-anchor-fallback-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const value = 1;\nconst other = 2;\n", "utf-8");

		const stale = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ set_line: { anchor: "99:bad", new_text: "const value = 99;" } }],
		}, cwd);

		expect(stale.type).toBe("skip");
		if (stale.type !== "skip") throw new Error("stale anchor unexpectedly projected");
		expect(stale.reason).toContain("anchor projection failed");
	});
});
