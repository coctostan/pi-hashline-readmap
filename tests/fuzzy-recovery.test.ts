import { describe, it, expect, beforeAll } from "vitest";
import { computeLineHash, applyHashlineEdits } from "../src/hashline.js";

describe("fuzzy content-based recovery", () => {
  beforeAll(async () => {
  });

  it("auto-relocates when one candidate has similarity > 0.8", () => {
    // File with a line that was slightly modified (trailing comma added)
    const originalLine = "const result = processData(input, options, config)";
    const modifiedLine = "const result = processData(input, options, config),";
    // High similarity — same tokens except trailing comma

    const lines = [
      "line 1",
      "line 2",
      originalLine, // line 3
      "line 4",
      "line 5",
    ];

    // Compute hash for original line 3
    const hash3 = computeLineHash(3, originalLine);

    // Modify the file — line 3 now has modified content
    const modifiedLines = [...lines];
    modifiedLines[2] = modifiedLine;
    const modifiedContent = modifiedLines.join("\n");

    // Use anchor with content: "3:HASH|original content"
    // Hash won't match, but content is similar enough for fuzzy recovery
    const result = applyHashlineEdits(modifiedContent, [
      { set_line: { anchor: `3:${hash3}|${originalLine}`, new_text: "edited line" } },
    ]);

    expect(result.content).toContain("edited line");
    expect(result.warnings).toBeDefined();
    expect(result.warnings!.some(w => w.includes("Fuzzy-relocated"))).toBe(true);
  });

  it("throws standard error when two candidates exceed 0.8 similarity", () => {
    // Two very similar lines — fuzzy recovery should refuse (ambiguous)
    const targetLine = "const value = compute(alpha, beta, gamma)";
    const similarLine1 = "const value = compute(alpha, beta, delta)";
    const similarLine2 = "const value = compute(alpha, beta, epsilon)";

    const lines = [
      "line 1",
      targetLine, // line 2
      "line 3",
      similarLine1, // line 4 — similar
      similarLine2, // line 5 — also similar
    ];
    const hash2 = computeLineHash(2, targetLine);

    // Modify file — remove original from line 2, similar lines remain at 4 and 5
    const modifiedLines = [...lines];
    modifiedLines[1] = "completely different content here";
    const modifiedContent = modifiedLines.join("\n");

    expect(() =>
      applyHashlineEdits(modifiedContent, [
        { set_line: { anchor: `2:${hash2}|${targetLine}`, new_text: "edited" } },
      ])
    ).toThrow(/changed since last read/);
  });

  it("throws standard error when similarity is below 0.8", () => {
    const originalLine = "function processData(input) { return transform(input); }";
    const lowSimilarityLine = "class DataProcessor { constructor() {} }";

    const lines = [
      "line 1",
      originalLine, // line 2
      "line 3",
    ];
    const hash2 = computeLineHash(2, originalLine);

    const modifiedLines = [...lines];
    modifiedLines[1] = lowSimilarityLine;
    const modifiedContent = modifiedLines.join("\n");

    expect(() =>
      applyHashlineEdits(modifiedContent, [
        { set_line: { anchor: `2:${hash2}|${originalLine}`, new_text: "edited" } },
      ])
    ).toThrow(/changed since last read/);
  });

  it("fuzzy relocation warning includes similarity score", () => {
    const originalLine = "export const myData = await loadConfig(alpha, beta, gamma, delta, epsilon)";
    const modifiedLine = "export const myData = await loadConfig(alpha, beta, gamma, delta, epsilon, zeta)";

    const hash2 = computeLineHash(2, originalLine);

    const modifiedLines = ["line 1", modifiedLine, "line 3"];
    const modifiedContent = modifiedLines.join("\n");

    const result = applyHashlineEdits(modifiedContent, [
      { set_line: { anchor: `2:${hash2}|${originalLine}`, new_text: "edited" } },
    ]);

    expect(result.warnings).toBeDefined();
    const fuzzyWarning = result.warnings!.find(w => w.includes("Fuzzy-relocated"));
    expect(fuzzyWarning).toBeDefined();
    expect(fuzzyWarning).toMatch(/similarity: 0\.\d+/);
  });

  it("falls through to standard error when anchor has no content after pipe", () => {
    const originalLine = "const x = 42;";
    const hash2 = computeLineHash(2, originalLine);

    const modifiedLines = ["line 1", "const y = 99;", "line 3"];
    const modifiedContent = modifiedLines.join("\n");

    // Anchor WITHOUT content after pipe — no fuzzy recovery possible
    expect(() =>
      applyHashlineEdits(modifiedContent, [
        { set_line: { anchor: `2:${hash2}`, new_text: "edited" } },
      ])
    ).toThrow(/changed since last read/);
  });
});
