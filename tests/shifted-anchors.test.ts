import { beforeAll, describe, expect, it } from "vitest";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { ServedLines } from "../src/served-lines.js";
import { remapShiftedAnchors } from "../src/shifted-anchors.js";

beforeAll(async () => {
  await ensureHashInit();
});

const h = (text: string) => computeLineHash(1, text);

function servedAfterWrite(before: string[], after: string[], lineMap: Array<number | undefined>) {
  const served = new ServedLines();
  served.record("/f", before.map((raw, index) => ({ line: index + 1, hash: computeLineHash(index + 1, raw) })), true);
  served.remapAfterWrite("/f", before, after, lineMap);
  return served;
}

describe("remapShiftedAnchors", () => {
  const before = ["s", "t", "}", "u", "}"];
  const after = ["s", "x", "t", "}", "u", "}"];

  it("remaps a stale anchor whose old line number now holds different content", () => {
    const served = servedAfterWrite(before, after, [1, 3, 4, 5, 6]);
    const result = remapShiftedAnchors({
      served,
      path: "/f",
      currentLines: after,
      edits: [{ set_line: { anchor: `3:${h("}")}`, new_text: "Z" } }],
    });
    expect(result).toEqual({
      ok: true,
      edits: [{ set_line: { anchor: `4:${h("}")}`, new_text: "Z" } }],
      notes: [`Anchor 3:${h("}")} predates an earlier edit that moved its line; remapped to 4:${h("}")}.`],
    });
  });

  it("leaves anchors that did not move untouched", () => {
    const served = servedAfterWrite(before, after, [1, 3, 4, 5, 6]);
    const edits = [{ insert_after: { anchor: `1:${h("s")}`, new_text: "y" } }];
    expect(remapShiftedAnchors({ served, path: "/f", currentLines: after, edits })).toEqual({ ok: true, edits, notes: [] });
  });

  it("does not touch source anchors of a cross-file copy", () => {
    const served = servedAfterWrite(before, after, [1, 3, 4, 5, 6]);
    const edits = [{ copy_lines: { start_anchor: `3:${h("}")}`, end_anchor: `3:${h("}")}`, after_anchor: `1:${h("s")}`, from_path: "other.ts" } }];
    expect(remapShiftedAnchors({ served, path: "/f", currentLines: after, edits })).toEqual({ ok: true, edits, notes: [] });
  });

  it("returns the edits unchanged without a served registry", () => {
    const edits = [{ set_line: { anchor: `3:${h("}")}`, new_text: "Z" } }];
    expect(remapShiftedAnchors({ served: undefined, path: "/f", currentLines: after, edits })).toEqual({ ok: true, edits, notes: [] });
  });
});

describe("remapShiftedAnchors refusals", () => {
  it("refuses a stale anchor that now matches a different identical line", () => {
    const before = ["a", "}", "}", "b"];
    const after = ["a", "x", "}", "}", "b"];
    const served = servedAfterWrite(before, after, [1, 3, 4, 5]);
    const result = remapShiftedAnchors({
      served,
      path: "/f",
      currentLines: after,
      edits: [{ set_line: { anchor: `3:${h("}")}`, new_text: "SECOND_BRACE_EDIT" } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("Edit rejected — nothing was written.");
    expect(result.message).toContain(
      `Anchor 3:${h("}")} predates an earlier edit that moved its line to 4, and line 3 now holds identical content, so it is ambiguous.`,
    );
    expect(result.message).toContain(`>>> 3:${h("}")}|}`);
    expect(result.message).toContain(`>>> 4:${h("}")}|}`);
    expect(result.rows.map((row) => row.anchor)).toEqual([`2:${h("x")}`, `3:${h("}")}`, `4:${h("}")}`, `5:${h("b")}`]);
  });

  it("refuses an anchor whose line an earlier edit removed", () => {
    const before = ["a", "}", "}", "}", "b"];
    const after = ["a", "}", "}", "b"];
    const served = servedAfterWrite(before, after, [1, 2, undefined, 3, 4]);
    const result = remapShiftedAnchors({
      served,
      path: "/f",
      currentLines: after,
      edits: [{ set_line: { anchor: `3:${h("}")}`, new_text: "Z" } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(
      `Anchor 3:${h("}")} points at a line an earlier edit to this file replaced or removed, or one that cannot be mapped unambiguously.`,
    );
    expect(result.rows.map((row) => row.anchor)).toEqual([`2:${h("}")}`, `3:${h("}")}`, `4:${h("b")}`]);
  });

  it("refuses a range whose endpoints moved by different amounts", () => {
    const before = ["a", "b", "c", "d"];
    const after = ["a", "x", "b", "c", "d"];
    const served = servedAfterWrite(before, after, [1, 3, 4, 5]);
    const result = remapShiftedAnchors({
      served,
      path: "/f",
      currentLines: after,
      edits: [{ replace_lines: { start_anchor: `1:${h("a")}`, end_anchor: `3:${h("c")}`, new_text: "Z" } }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain(
      `Range 1:${h("a")}..3:${h("c")} spans lines an earlier edit inserted or removed, so its old extent no longer matches the file.`,
    );
    expect(result.message).toContain(`>>> 4:${h("c")}|c`);
  });

  it("remaps a range whose endpoints moved together", () => {
    const before = ["a", "b", "c", "d"];
    const after = ["x", "a", "b", "c", "d"];
    const served = servedAfterWrite(before, after, [2, 3, 4, 5]);
    const result = remapShiftedAnchors({
      served,
      path: "/f",
      currentLines: after,
      edits: [{ replace_lines: { start_anchor: `2:${h("b")}`, end_anchor: `3:${h("c")}`, new_text: "Z" } }],
    });
    expect(result).toEqual({
      ok: true,
      edits: [{ replace_lines: { start_anchor: `3:${h("b")}`, end_anchor: `4:${h("c")}`, new_text: "Z" } }],
      notes: [
        `Anchor 2:${h("b")} predates an earlier edit that moved its line; remapped to 3:${h("b")}.`,
        `Anchor 3:${h("c")} predates an earlier edit that moved its line; remapped to 4:${h("c")}.`,
      ],
    });
  });
});
