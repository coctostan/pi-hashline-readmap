import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

describe("pending hashline edit preview", () => {
	beforeAll(async () => {
	});

	it("projects an anchored set_line edit", async () => {
		const cwd = mkdtempSync(resolve(tmpdir(), "pi-pending-anchor-success-"));
		const filePath = resolve(cwd, "sample.ts");
		writeFileSync(filePath, "const value = 1;\nconst other = 2;\n", "utf-8");
		const anchor = `1:${computeLineHash(1, "const value = 1;")}`;

		const projected = await buildPendingEditPreviewData({
			path: filePath,
			edits: [{ set_line: { anchor, new_text: "const value = 10;" } }],
		}, cwd);

		expect(projected.type).toBe("ok");
		if (projected.type !== "ok") throw new Error(projected.reason);
		expect(projected.data.nextContent).toContain("const value = 10;");
		expect(projected.data.diff).toContain("-1 const value = 1;");
		expect(projected.data.diff).toContain("+1 const value = 10;");
	});
});
