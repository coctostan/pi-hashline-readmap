import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, computeLineHash } from "../src/hashline.js";

describe("duplicate single-target hashline warnings", () => {
  beforeAll(async () => {
  });

  it("warns for same-line replace_lines conflicts and keeps the last effective single-target edit", () => {
    const content = ["const a = 1;", "const b = 2;", "const c = 3;"].join("\n");
    const anchor = `2:${computeLineHash(2, "const b = 2;")}`;

    const result = applyHashlineEdits(content, [
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: "const b = 20;" } },
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: "const b = 200;" } },
      { replace_lines: { start_anchor: anchor, end_anchor: anchor, new_text: "const b = 20;" } },
    ]);

    expect(result.content).toBe(["const a = 1;", "const b = 20;", "const c = 3;"].join("\n"));
    expect(result.warnings).toContain(
      `Warning: multiple edits target the same anchor ${anchor} — only the last will apply`,
    );
  });
});
