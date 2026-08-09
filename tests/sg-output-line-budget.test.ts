import { beforeAll, describe, expect, it } from "vitest";
import { ensureHashInit } from "../src/hashline.js";
import { buildPtcLine } from "../src/ptc-value.js";
import { buildSgOutput } from "../src/sg-output.js";

describe("ast_search final line budget", () => {
  beforeAll(async () => ensureHashInit());

  it("omits an oversized multiline block without cutting a source record", () => {
    const source = Array.from({ length: 8 }, (_, index) => `const value${index} = ${index};`);
    const output = buildSgOutput({
      pattern: "$X",
      budget: { maxLines: 4, maxBytes: 4096 },
      matchLimit: { limit: 1, totalMatches: 3, returnedMatches: 1, omittedMatches: 2 },
      files: [{
        displayPath: "large.ts",
        path: "/repo/large.ts",
        ranges: [{ startLine: 1, endLine: 8 }],
        lines: source.map((line, index) => buildPtcLine(index + 1, line)),
      }],
    });

    expect(output.text.split("\n").length).toBeLessThanOrEqual(4);
    expect(output.text).not.toMatch(/^>>/m);
    expect(output.text).toContain("[Results truncated:");
    expect(output.text).toContain("2 omitted");
    expect(output.text).toContain("output budget showing 0 of 1 complete blocks");
    expect(output.ptcValue.files[0].lines).toHaveLength(8);
    expect(output.ptcValue.truncation?.outputBudget).toMatchObject({
      maxLines: 4,
      totalBlocks: 1,
      shownBlocks: 0,
      omittedBlocks: 1,
      totalLines: 9,
      shownLines: 0,
    });
    expect(output.ptcValue.truncation?.matchLimit?.omittedMatches).toBe(2);
  });
});
