import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ctagsMapper, resetCtagsCache } from "../src/readmap/mappers/ctags.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function ctagsAvailable(): Promise<boolean> {
  try {
    await execFileAsync("ctags", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

describe("ctagsMapper subprocess safety (GH #116)", () => {
  it("does not import shell exec", async () => {
    const text = await readFile(resolve(__dirname, "../src/readmap/mappers/ctags.ts"), "utf8");
    expect(text).not.toMatch(/import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*["']node:child_process["']/s);
  });

  it("does not contain shell redirection or wc shell commands", async () => {
    const text = await readFile(resolve(__dirname, "../src/readmap/mappers/ctags.ts"), "utf8");
    expect(text).not.toContain("2>/dev/null");
    expect(text).not.toContain("wc -l <");
  });

  describe.skipIf(process.platform === "win32")("quoted POSIX filename runtime fixture", () => {
    let dir = "";
    let filePath = "";
    let available = false;

    beforeAll(async () => {
      available = await ctagsAvailable();
      if (!available) return;
      dir = await mkdtemp(join(tmpdir(), "ctagsmap-quoting-"));
      filePath = join(dir, 'has"quote$dollar.ts');
      await writeFile(filePath, "export function hello() {\n  return 1;\n}\n", "utf8");
    });

    afterAll(async () => {
      resetCtagsCache();
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    it("returns a non-null FileMap for quoted path when ctags is installed", async () => {
      if (!available) return;
      resetCtagsCache();
      const fileMap = await ctagsMapper(filePath);
      expect(fileMap).not.toBeNull();
      const names = (fileMap?.symbols ?? []).map((s) => s.name);
      expect(names).toContain("hello");
    });
  });
});
