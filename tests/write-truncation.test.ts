import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeWrite } from "../src/write.js";

describe("write truncation notice", () => {
  let tmpDir = "";

  beforeAll(async () => {
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("mentions ptcValue when visible output omits lines", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "write-truncation-"));
    const filePath = join(tmpDir, "long.txt");
    const content = Array.from({ length: 2003 }, (_, index) => `line ${index + 1}`).join("\n");

    const result = await executeWrite({ path: filePath, content });

    expect(result.ptcValue.lines).toHaveLength(2003);
    expect(result.text).toContain("[… 3 more lines not shown — full anchors in ptcValue]");
  });
});
