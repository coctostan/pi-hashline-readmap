import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fallbackMapper } from "../src/readmap/mappers/fallback.js";

describe("fallbackMapper with shell metacharacters in path (GH #116)", () => {
  describe.skipIf(process.platform === "win32")("quoted POSIX filename runtime fixture", () => {
    let dir: string;
    let filePath: string;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), "fallback-quoting-"));
      filePath = join(dir, 'has"quote$dollar.py');
      await writeFile(filePath, "def hello():\n    return 1\n", "utf8");
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it("returns a non-null FileMap with the hello symbol", async () => {
      const fileMap = await fallbackMapper(filePath);
      expect(fileMap).not.toBeNull();
      const names = (fileMap?.symbols ?? []).map((s) => s.name);
      expect(names).toContain("hello");
    });
  });
});
