import { beforeAll, describe, expect, it } from "vitest";
import { ensureHashInit } from "../src/hashline.js";
import { buildPtcLine } from "../src/ptc-value.js";
import { buildSgOutput } from "../src/sg-output.js";

describe("ast_search final byte budget", () => {
  beforeAll(async () => ensureHashInit());

  it("omits a display-truncated line that still cannot fit with guidance", () => {
    const raw = `const value = "${"x".repeat(1000)}";`;
    const output = buildSgOutput({
      pattern: "$X",
      budget: { maxLines: 10, maxBytes: 400 },
      files: [{
        displayPath: "long.ts",
        path: "/repo/long.ts",
        ranges: [{ startLine: 1, endLine: 1 }],
        lines: [buildPtcLine(1, raw)],
      }],
    });

    expect(Buffer.byteLength(output.text, "utf8")).toBeLessThanOrEqual(400);
    expect(output.text).not.toMatch(/^>>/m);
    expect(output.text).toContain("[Output truncated:");
    expect(output.text).toContain("showing 0 of 1 complete blocks");
    expect(output.ptcValue.files[0].lines[0].raw).toBe(raw);
    expect(output.ptcValue.truncation?.outputBudget).toMatchObject({
      maxBytes: 400,
      totalBlocks: 1,
      shownBlocks: 0,
      omittedBlocks: 1,
    });
  });
});
