import { describe, it, expect, beforeAll } from "vitest";
import { ensureHashInit, computeLineHash, applyHashlineEdits } from "../src/hashline.js";

describe("no content-similarity recovery for stale anchors", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("refuses a stale anchor even when the changed line is very similar", () => {
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

    // A changed line is stale. Editing a "similar" line instead would silently overwrite a
    // change the model has not seen, so the edit is refused with fresh anchors.
    expect(() =>
      applyHashlineEdits(modifiedContent, [
        { set_line: { anchor: `3:${hash3}|${originalLine}`, new_text: "edited line" } },
      ]),
    ).toThrow(/changed since last read/);
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

  it("refuses a stale anchor whose line gained a token", () => {
    const originalLine = "export const myData = await loadConfig(alpha, beta, gamma, delta, epsilon)";
    const modifiedLine = "export const myData = await loadConfig(alpha, beta, gamma, delta, epsilon, zeta)";

    const hash2 = computeLineHash(2, originalLine);

    const modifiedLines = ["line 1", modifiedLine, "line 3"];
    const modifiedContent = modifiedLines.join("\n");

    expect(() =>
      applyHashlineEdits(modifiedContent, [
        { set_line: { anchor: `2:${hash2}|${originalLine}`, new_text: "edited" } },
      ]),
    ).toThrow(/Did you mean one of these nearby lines\?[\s\S]*zeta/);
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
