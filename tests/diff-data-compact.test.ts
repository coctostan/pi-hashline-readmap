import { describe, expect, it, beforeAll } from "vitest";
import { generateCompactOrFullDiff } from "../src/edit-diff.js";
import { buildDiffData } from "../src/diff-data.js";

describe("DiffData compact hashline diffs", () => {
  beforeAll(async () => {
  });

  it("keeps compact replacement diff strings while expanding structured rows", () => {
    const oldContent = "line one\nline two\nline three";
    const newContent = "line one\nline TWO\nline three";
    const { diff } = generateCompactOrFullDiff(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diff).toMatch(/^2:[0-9a-f]{3}\|line two → 2:[0-9a-f]{3}\|line TWO$/);
    expect(diffData.entries).toEqual([
      { kind: "remove", oldLine: 2, text: "line two" },
      { kind: "add", newLine: 2, text: "line TWO" },
    ]);
    expect(diffData.stats).toEqual({ added: 1, removed: 1, context: 0 });
  });

  it("uses source contents when compact replacement text contains delimiter-shaped text", () => {
    const oldContent = "line one\nconst text = 'old';\nline three";
    const newContent = "line one\nconst text = 'new → 2:def|not a separator';\nline three";
    const { diff } = generateCompactOrFullDiff(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.entries).toEqual([
      { kind: "remove", oldLine: 2, text: "const text = 'old';" },
      { kind: "add", newLine: 2, text: "const text = 'new → 2:def|not a separator';" },
    ]);
  });

  it("keeps compact deletion diff strings while expanding structured rows", () => {
    const oldContent = "line one\nline two\nline three";
    const newContent = "line one\nline three";
    const { diff } = generateCompactOrFullDiff(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diff).toMatch(/^2:[0-9a-f]{3}\|line two → \[deleted\]$/);
    expect(diffData.entries).toEqual([{ kind: "remove", oldLine: 2, text: "line two" }]);
    expect(diffData.stats).toEqual({ added: 0, removed: 1, context: 0 });
  });
});
