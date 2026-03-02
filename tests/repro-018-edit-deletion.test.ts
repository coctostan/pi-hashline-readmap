/**
 * Reproduction test for Bug #018:
 * set_line with new_text:"" fails to delete BLANK lines due to noop detection.
 *
 * Non-empty line deletion works fine (those tests pass).
 * The bug is specifically when trying to delete an already-empty line:
 * orig.join("\n") === "" === newL.join("\n") → noop detected → line NOT removed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, computeLineHash, ensureHashInit } from "../src/hashline.js";

describe("Bug #018: set_line with new_text='' line deletion", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });
  // This case WORKS (non-empty line)
  it("set_line new_text='' removes a non-empty line (this works)", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    const hash3 = computeLineHash(3, "line3");

    const result = applyHashlineEdits(content, [
      { set_line: { anchor: `3:${hash3}`, new_text: "" } }
    ]);

    const resultLines = result.content.split("\n");
    expect(resultLines).toHaveLength(4);
    expect(resultLines).toEqual(["line1", "line2", "line4", "line5"]);
  });

  // This case FAILS (empty/blank line) — the real bug
  it("deletes a blank line instead of marking the edit as noop", () => {
    // File has a blank line 3 — user wants to delete it
    const content = "line1\nline2\n\nline4\nline5";
    const hashBlank = computeLineHash(3, ""); // hash of empty line

    const result = applyHashlineEdits(content, [
      { set_line: { anchor: `3:${hashBlank}`, new_text: "" } }
    ]);

    // BUG: orig=[""], newL=[] → orig.join("\n")==="" === newL.join("\n")==="" → noop
    // result.content === original content, blank line is NOT removed
    // noopEdits is populated — edit.ts would throw "No changes made"
    expect(result.noopEdits).toBeUndefined(); // FAILS: noopEdits is set
    expect(result.content).not.toBe(content);  // FAILS: content is unchanged
    const lines = result.content.split("\n");
    expect(lines).toHaveLength(4); // FAILS: still has 5 lines
    expect(lines).toEqual(["line1", "line2", "line4", "line5"]); // FAILS: blank line stays
  });
});
