import { describe, it, expect, beforeAll } from "vitest";
import { buildEditOutput } from "../src/edit-output.js";
describe("buildEditOutput semanticSummary", () => {
  beforeAll(async () => {
  });
  it("includes semanticSummary in ptcValue when provided", () => {
    const result = buildEditOutput({
      path: "/tmp/test.ts",
      displayPath: "test.ts",
      diff: "+1 const x = 10;",
      firstChangedLine: 1,
      warnings: [],
      noopEdits: [],
      edits: [{ set_line: { anchor: "1:abc", new_text: "const x = 10;" } }],
      semanticSummary: {
        classification: "semantic",
        difftasticAvailable: true,
        movedBlocks: 0,
      },
    });

    expect(result.ptcValue.semanticSummary).toEqual({
      classification: "semantic",
      difftasticAvailable: true,
      movedBlocks: 0,
    });
  });
  it("omits semanticSummary from ptcValue when not provided", () => {
    const result = buildEditOutput({
      path: "/tmp/test.ts",
      displayPath: "test.ts",
      diff: "+1 const x = 10;",
      firstChangedLine: 1,
      warnings: [],
      noopEdits: [],
      edits: [{ set_line: { anchor: "1:abc", new_text: "const x = 10;" } }],
    });
    expect(result.ptcValue.semanticSummary).toBeUndefined();
  });
  it("stays quiet for mixed classifications when no blocks moved", () => {
    const result = buildEditOutput({
      path: "/tmp/test.ts",
      displayPath: "test.ts",
      diff: [
        "--- a/test.ts",
        "+++ b/test.ts",
        "@@ -1 +1 @@",
        "-const value = 1;",
        "+const value = 2; ",
      ].join("\n"),
      firstChangedLine: 1,
      warnings: [],
      noopEdits: [],
      edits: [{ set_line: { anchor: "1:abc", new_text: "const value = 2; " } }],
      semanticSummary: {
        classification: "mixed",
        difftasticAvailable: false,
        movedBlocks: 0,
      },
    });

    expect(result.text).toBe("Edited test.ts (1 change, +1 -1 line)");
    expect(result.text).not.toContain("[semantic:");
    expect(result.text).not.toContain("⚠ Edit classified as whitespace-only");
  });
  it("preserves movedBlocks in ptcValue without changing the semanticSummary shape", () => {
    const result = buildEditOutput({
      path: "/tmp/test.ts",
      displayPath: "test.ts",
      diff: [
        "--- a/test.ts",
        "+++ b/test.ts",
        "@@ -1,2 +1,2 @@",
        "-const a = 1;",
        "-const b = 2;",
        "+const b = 2;",
        "+const a = 1;",
      ].join("\n"),
      firstChangedLine: 1,
      warnings: [],
      noopEdits: [],
      edits: [{ replace_lines: { start_anchor: "1:abc", end_anchor: "2:def", new_text: "const b = 2;\nconst a = 1;" } }],
      semanticSummary: {
        classification: "mixed",
        difftasticAvailable: true,
        movedBlocks: 2,
      },
    });

    expect(result.ptcValue.semanticSummary).toEqual({
      classification: "mixed",
      difftasticAvailable: true,
      movedBlocks: 2,
    });
  });
});
