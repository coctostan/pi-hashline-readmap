import { describe, expect, it } from "vitest";
import { applyBashContextGuard } from "../src/rtk/bash-context-guard.js";

describe("applyBashContextGuard", () => {
  it("leaves within-limit Bash output byte-for-byte unchanged while attaching metadata", () => {
    const text = "alpha\nbeta";

    const result = applyBashContextGuard({
      text,
      config: { enabled: true, maxLines: 5, maxBytes: 1024, headLines: 2, tailLines: 2 },
    });

    expect(result.text).toBe(text);
    expect(result.metadata).toEqual({
      enabled: true,
      trimmed: false,
      trimWanted: false,
      postRtkLineCount: 2,
      postRtkByteCount: Buffer.byteLength(text, "utf8"),
      maxLines: 5,
      maxBytes: 1024,
      headLines: 2,
      tailLines: 2,
      preservedNoticeCount: 0,
    });
  });

  it("returns disabled metadata without trimming when the guard is disabled", () => {
    const text = "alpha\nbeta\ngamma";

    const result = applyBashContextGuard({
      text,
      config: { enabled: false, maxLines: 1, maxBytes: 1, headLines: 1, tailLines: 1 },
    });

    expect(result.text).toBe(text);
    expect(result.metadata).toMatchObject({
      enabled: false,
      trimmed: false,
      trimWanted: false,
      postRtkLineCount: 3,
      postRtkByteCount: Buffer.byteLength(text, "utf8"),
      maxLines: 1,
      maxBytes: 1,
      headLines: 1,
      tailLines: 1,
    });
  });
});
