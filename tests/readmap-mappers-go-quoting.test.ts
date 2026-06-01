import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { goMapper } from "../src/readmap/mappers/go.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

async function goAvailable(): Promise<boolean> {
  try {
    await execFileAsync("go", ["version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

describe("goMapper subprocess safety (GH #116)", () => {
  it("does not import shell exec", async () => {
    const text = await readFile(resolve(__dirname, "../src/readmap/mappers/go.ts"), "utf8");
    expect(text).not.toMatch(/import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*["']node:child_process["']/s);
  });

  describe.skipIf(process.platform === "win32")("quoted POSIX filename runtime fixture", () => {
    let dir = "";
    let filePath = "";
    let available = false;

    beforeAll(async () => {
      available = await goAvailable();
      if (!available) return;
      dir = await mkdtemp(join(tmpdir(), "gomap-quoting-"));
      filePath = join(dir, 'has"quote$dollar.go');
      await writeFile(filePath, "package main\n\nfunc Hello() int {\n\treturn 1\n}\n", "utf8");
    });

    afterAll(async () => {
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    it("returns a non-null FileMap with the Hello symbol when Go is installed", async () => {
      if (!available) return;
      const fileMap = await goMapper(filePath);
      expect(fileMap).not.toBeNull();
      const names = (fileMap?.symbols ?? []).map((s) => s.name);
      expect(names).toContain("Hello");
    });
  });
});
