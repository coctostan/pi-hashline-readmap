import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { jsonMapper } from "../src/readmap/mappers/json.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function jqAvailable(): Promise<boolean> {
  try {
    await execFileAsync("jq", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

describe("jsonMapper subprocess safety (GH #116)", () => {
  it("does not import shell exec", async () => {
    const text = await readFile(resolve(__dirname, "../src/readmap/mappers/json.ts"), "utf8");
    expect(text).not.toMatch(/import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*["']node:child_process["']/s);
  });

  describe.skipIf(process.platform === "win32")("quoted POSIX filename runtime fixture", () => {
    let dir = "";
    let filePath = "";
    let available = false;

    beforeAll(async () => {
      available = await jqAvailable();
      if (!available) return;
      dir = await mkdtemp(join(tmpdir(), "jsonmap-quoting-"));
      filePath = join(dir, 'has"quote$dollar.json');
      await writeFile(filePath, '{"hello": {"enabled": true}}\n', "utf8");
    });

    afterAll(async () => {
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    it("returns a non-null FileMap for quoted JSON path when jq is installed", async () => {
      if (!available) return;
      const fileMap = await jsonMapper(filePath);
      expect(fileMap).not.toBeNull();
      const names = (fileMap?.symbols ?? []).map((s) => s.name);
      expect(names.some((name) => name.includes("hello"))).toBe(true);
    });
  });
});
