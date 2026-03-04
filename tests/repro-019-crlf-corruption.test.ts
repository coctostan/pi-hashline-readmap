/**
 * Reproduction test for Bug #019:
 * CRLF files get mixed line endings + extra blank lines from insert_after.
 *
 * Root cause in splitDst():
 *   "inserted\r\n".split("\n") → ["inserted\r", ""]
 *   "inserted\n".split("\n")   → ["inserted", ""]
 * The trailing "" becomes an unwanted blank line.
 * The embedded \r (from \r\n) then gets doubled when restoreLineEndings applies.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, computeLineHash, ensureHashInit } from "../src/hashline.js";
import { detectLineEnding, normalizeToLF, restoreLineEndings, stripBom } from "../src/edit-diff.js";

function applyAndRestore(rawCRLF: string, edits: Parameters<typeof applyHashlineEdits>[1]) {
  const { text: content } = stripBom(rawCRLF);
  const origEnd = detectLineEnding(content);
  const normalized = normalizeToLF(content);
  const result = applyHashlineEdits(normalized, edits);
  return restoreLineEndings(result.content, origEnd);
}

describe("Bug #019: CRLF files corrupted by insert_after", () => {
  const rawCRLF = "line1\r\nline2\r\nline3\r\n";
  let hash1 = "";

  beforeAll(async () => {
    await ensureHashInit();
    hash1 = computeLineHash(1, "line1");
  });

  it("normalizes CRLF insert_after text without doubled CR", () => {
    const restored = applyAndRestore(rawCRLF, [
      { insert_after: { anchor: `1:${hash1}`, new_text: "inserted\r\n" } }
    ]);

    // Bug: splitDst("inserted\r\n") = ["inserted\r", ""]
    // restoreLineEndings then converts \n → \r\n for ALL \n,
    // giving "inserted\r\r\n" (doubled CR) + extra blank line "\r\n"
    const hasDoubleCR = restored.includes("\r\r");
    expect(hasDoubleCR).toBe(false); // FAILS: contains \r\r

    // Also causes extra blank line
    expect(restored).toBe("line1\r\ninserted\r\nline2\r\nline3\r\n"); // FAILS
  });

  it("does not add an extra blank line when insert_after text ends with LF", () => {
    const restored = applyAndRestore(rawCRLF, [
      { insert_after: { anchor: `1:${hash1}`, new_text: "inserted\n" } }
    ]);

    // Bug: splitDst("inserted\n") = ["inserted", ""] — trailing "" → extra blank
    // No doubled CR (LF text works through restoreLineEndings cleanly),
    // but an extra blank line appears
    expect(restored).toBe("line1\r\ninserted\r\nline2\r\nline3\r\n"); // FAILS: extra blank line
  });

  it("insert_after without trailing newline inserts correctly", () => {
    const restored = applyAndRestore(rawCRLF, [
      { insert_after: { anchor: `1:${hash1}`, new_text: "inserted" } }
    ]);

    // This works because splitDst("inserted") = ["inserted"] — no trailing ""
    expect(restored).toBe("line1\r\ninserted\r\nline2\r\nline3\r\n");
  });
});
