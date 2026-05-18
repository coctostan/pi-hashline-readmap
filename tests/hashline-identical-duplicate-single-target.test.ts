import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, computeLineHash } from "../src/hashline.js";
describe("identical duplicate single-target edits", () => {
  beforeAll(async () => {
  });
  it("silently deduplicates identical replacements without warning", () => {
    const content = ["const a = 1;", "const b = 2;", "const c = 3;"].join("\n");
    const anchor = `3:${computeLineHash(3, "const c = 3;")}`;
    const result = applyHashlineEdits(content, [
      { set_line: { anchor, new_text: "const c = 30;" } },
      { set_line: { anchor, new_text: "const c = 30;" } },
    ]);
    expect(result.content).toBe(["const a = 1;", "const b = 2;", "const c = 30;"].join("\n"));
    expect(result.warnings).toBeUndefined();
  });
});
