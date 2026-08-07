import { beforeAll, describe, expect, it } from "vitest";
import { applyHashlineEdits, computeLineHash, ensureHashInit } from "../src/hashline.js";

describe("issue 238 — duplicate single targets", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("keeps only the final conflicting edit for one resolved single target", () => {
    const content = ["A", "B", "C"].join("\n");
    const anchor = `2:${computeLineHash(2, "B")}`;
    const result = applyHashlineEdits(content, [
      { set_line: { anchor, new_text: "X\nY" } },
      { set_line: { anchor, new_text: "Z" } },
    ]);

    expect(result.content).toBe(["A", "Z", "C"].join("\n"));
    expect(result.warnings).toContain(
      `Warning: multiple edits target the same anchor ${anchor} — only the last will apply`,
    );
  });
});
