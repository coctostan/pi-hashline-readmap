import { describe, expect, it, beforeAll } from "vitest";
import { generateCompactOrFullDiff, generateDiffString } from "../src/edit-diff.js";
import { buildDiffData, MAX_INLINE_DIFF_LINE_LENGTH, MAX_INLINE_DIFF_PAIRS, MAX_INLINE_DIFF_TOKENS } from "../src/diff-data.js";

function joinSpans(spans: Array<{ text: string }>): string {
  return spans.map((span) => span.text).join("");
}

describe("DiffData inline diffs", () => {
  beforeAll(async () => {
  });

  it("adds inline spans for similar compact rename rows", () => {
    const oldContent = "function greet(firstName: string) { return firstName; }";
    const newContent = "function greet(displayName: string) { return displayName; }";
    const { diff } = generateCompactOrFullDiff(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.inlineDiffs).toHaveLength(1);
    const inline = diffData.inlineDiffs![0];
    expect(inline.removeLineIndex).toBe(0);
    expect(inline.addLineIndex).toBe(1);
    expect(joinSpans(inline.removeSpans)).toBe("function greet(firstName: string) { return firstName; }");
    expect(joinSpans(inline.addSpans)).toBe("function greet(displayName: string) { return displayName; }");
    expect(inline.removeSpans.some((span) => span.kind === "remove" && span.text.includes("firstName"))).toBe(true);
    expect(inline.addSpans.some((span) => span.kind === "add" && span.text.includes("displayName"))).toBe(true);
  });

  it("adds inline spans for a multi-token single-line edit", () => {
    const oldContent = "const total = price + tax;";
    const newContent = "const subtotal = price - discount + tax;";
    const { diff } = generateCompactOrFullDiff(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.inlineDiffs).toHaveLength(1);
    const inline = diffData.inlineDiffs![0];
    expect(joinSpans(inline.removeSpans)).toBe(oldContent);
    expect(joinSpans(inline.addSpans)).toBe(newContent);
    expect(inline.removeSpans.some((span) => span.kind === "remove" && span.text.includes("total"))).toBe(true);
    expect(inline.addSpans.some((span) => span.kind === "add" && span.text.includes("subtotal"))).toBe(true);
    expect(inline.addSpans.some((span) => span.kind === "add" && span.text.includes("discount"))).toBe(true);
  });

  it("pairs multi-line replacement rows by hunk-relative position", () => {
    const oldContent = [
      "function one(firstName: string) { return firstName; }",
      "function two(lastName: string) { return lastName; }",
    ].join("\n");
    const newContent = [
      "function one(displayName: string) { return displayName; }",
      "function two(familyName: string) { return familyName; }",
    ].join("\n");
    const { diff } = generateDiffString(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.inlineDiffs).toHaveLength(2);
    expect(diffData.inlineDiffs![0]!.removeLineIndex).toBe(0);
    expect(diffData.inlineDiffs![0]!.addLineIndex).toBe(2);
    expect(joinSpans(diffData.inlineDiffs![0]!.removeSpans)).toBe("function one(firstName: string) { return firstName; }");
    expect(joinSpans(diffData.inlineDiffs![0]!.addSpans)).toBe("function one(displayName: string) { return displayName; }");
    expect(diffData.inlineDiffs![1]!.removeLineIndex).toBe(1);
    expect(diffData.inlineDiffs![1]!.addLineIndex).toBe(3);
    expect(joinSpans(diffData.inlineDiffs![1]!.removeSpans)).toBe("function two(lastName: string) { return lastName; }");
    expect(joinSpans(diffData.inlineDiffs![1]!.addSpans)).toBe("function two(familyName: string) { return familyName; }");
  });

  it("skips ambiguous unequal remove/add hunks", () => {
    const oldContent = "const firstName = user.firstName;";
    const newContent = [
      "const displayName = user.displayName;",
      "const fallbackName = user.name;",
    ].join("\n");
    const { diff } = generateDiffString(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.inlineDiffs ?? []).toHaveLength(0);
  });

  it("skips unrelated remove/add pairs", () => {
    const oldContent = "alpha beta gamma";
    const newContent = "completely unrelated text";
    const { diff } = generateCompactOrFullDiff(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.inlineDiffs ?? []).toHaveLength(0);
  });

  it("skips lines longer than the inline diff cap", () => {
    const oldContent = `prefix ${"a".repeat(MAX_INLINE_DIFF_LINE_LENGTH + 1)}`;
    const newContent = `prefix ${"b".repeat(MAX_INLINE_DIFF_LINE_LENGTH + 1)}`;
    const { diff } = generateDiffString(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.inlineDiffs ?? []).toHaveLength(0);
  });

  it("skips token-heavy lines before allocating inline diff tables", () => {
    const oldContent = Array.from({ length: MAX_INLINE_DIFF_TOKENS + 1 }, (_, index) => `a${index}`).join(" ");
    const newContent = Array.from({ length: MAX_INLINE_DIFF_TOKENS + 1 }, (_, index) => `b${index}`).join(" ");
    const { diff } = generateDiffString(oldContent, newContent);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect(diffData.inlineDiffs ?? []).toHaveLength(0);
  });

  it("does not create inline diffs for added-only or removed-only changes", () => {
    const addedOnly = buildDiffData({
      path: "sample.ts",
      oldContent: "alpha",
      newContent: "alpha\nbeta",
      diff: generateDiffString("alpha", "alpha\nbeta").diff,
    });
    expect(addedOnly.inlineDiffs ?? []).toHaveLength(0);

    const removedOnly = buildDiffData({
      path: "sample.ts",
      oldContent: "alpha\nbeta",
      newContent: "alpha",
      diff: generateDiffString("alpha\nbeta", "alpha").diff,
    });
    expect(removedOnly.inlineDiffs ?? []).toHaveLength(0);
  });


  it("caps total inline diff pair work", () => {
    const oldContent = Array.from({ length: 260 }, (_, index) => `const value${index} = oldName + ${index};`).join("\n");
    const newContent = Array.from({ length: 260 }, (_, index) => `const value${index} = newName + ${index};`).join("\n");
    const { diff } = generateDiffString(oldContent, newContent, 0);

    const diffData = buildDiffData({ path: "sample.ts", oldContent, newContent, diff });

    expect((diffData.inlineDiffs ?? []).length).toBeLessThanOrEqual(MAX_INLINE_DIFF_PAIRS);
  });
});
