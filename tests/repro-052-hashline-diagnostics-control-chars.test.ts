import { describe, it, expect, beforeAll } from "vitest";
import { applyHashlineEdits, computeLineHash } from "../src/hashline.js";

const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

describe("Bug #052: hashline mismatch diagnostics escape control characters", () => {
  beforeAll(async () => {
  });

  it("mismatch previews render escaped control bytes instead of raw bytes", () => {
    const currentContent = [
      "const a = 1;",
      "const message = \"bell:\x07\";",
      "const c = 3;",
    ].join("\n");

    const staleHash = computeLineHash(2, 'const message = "bell";');

    try {
      applyHashlineEdits(currentContent, [
        {
          set_line: {
            anchor: `2:${staleHash}|const message = "bell";`,
            new_text: 'const message = "updated";',
          },
        },
      ]);
      expect.unreachable("Should have thrown mismatch error");
    } catch (err: any) {
      expect(err.message).toContain("changed since last read");
      expect(err.message).toContain("\\u0007");
      expect(CONTROL_CHAR_RE.test(err.message)).toBe(false);
    }
  });
});
