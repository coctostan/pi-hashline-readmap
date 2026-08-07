import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash, ensureHashInit, type HashlineEditItem } from "../src/hashline.js";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

describe("issue 238 — insertion boundaries", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("skips previews when another edit consumes the insertion boundary", async () => {
    const content = ["A", "B", "C", "D"].join("\n");
    const anchor = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;
    const unsafe: HashlineEditItem[][] = [
      [
        { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(3, "C"), new_text: "R" } },
        { insert_after: { anchor: anchor(3, "C"), new_text: "AFTER-C" } },
      ],
      [
        { replace_lines: { start_anchor: anchor(1, "A"), end_anchor: anchor(3, "C"), new_text: "R" } },
        { insert_after: { anchor: anchor(2, "B"), new_text: "AFTER-B" } },
      ],
      [
        { set_line: { anchor: anchor(2, "B"), new_text: "" } },
        { insert_after: { anchor: anchor(2, "B"), new_text: "AFTER-DELETED-B" } },
      ],
      [
        { set_line: { anchor: anchor(2, "B"), new_text: "B1\nB2" } },
        { insert_after: { anchor: anchor(2, "B"), new_text: "AFTER-B" } },
      ],
    ];

    const cwd = mkdtempSync(resolve(tmpdir(), "pi-overlap-preview-"));
    const filePath = resolve(cwd, "sample.ts");
    writeFileSync(filePath, content, "utf8");

    for (const edits of unsafe) {
      const preview = await buildPendingEditPreviewData({ path: filePath, edits }, cwd);
      expect(preview.type).toBe("skip");
      if (preview.type !== "skip") throw new Error("unsafe overlap unexpectedly projected");
      expect(preview.reason).toContain(
        "anchor projection failed: Overlapping anchored edits are not allowed",
      );
    }
  });
});
