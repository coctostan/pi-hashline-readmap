import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

const execFileAsync = promisify(execFile);

interface PackFile {
  path: string;
}

interface PackResult {
  filename: string;
  files: PackFile[];
}

async function goAvailable(): Promise<boolean> {
  try {
    await execFileAsync("go", ["version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

describe("published mapper scripts", () => {
  afterEach(() => {
    vi.doUnmock("node:url");
    vi.resetModules();
  });

  it("packages runnable Python and Go mapper helpers without the generated Go binary", async () => {
    const root = await mkdtemp(join(tmpdir(), "packed-mapper-scripts-"));
    try {
      const { stdout } = await execFileAsync(
        "npm",
        ["pack", "--json", "--pack-destination", root],
        { cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 },
      );
      const [packed] = JSON.parse(stdout) as PackResult[];
      const paths = packed.files.map((file) => file.path);

      expect(paths).toEqual(expect.arrayContaining([
        "scripts/gdscript_outline.py",
        "scripts/python_outline.py",
        "scripts/go_outline.go",
      ]));
      expect(paths).not.toContain("scripts/go_outline");

      if (process.platform === "win32") return;
      await execFileAsync("tar", ["-xzf", join(root, packed.filename), "-C", root]);
      const packageRoot = join(root, "package");
      const pythonFixture = join(root, "sample.py");
      const goFixture = join(root, "sample.go");
      await writeFile(pythonFixture, "def hello():\n    return 1\n", "utf8");
      await writeFile(goFixture, "package main\n\nfunc Hello() int { return 1 }\n", "utf8");

      const actualNodeUrl = await vi.importActual<typeof import("node:url")>("node:url");
      vi.resetModules();
      vi.doMock("node:url", () => ({
        ...actualNodeUrl,
        fileURLToPath(url: string | URL): string {
          const actualPath = actualNodeUrl.fileURLToPath(url);
          const mapperSuffix = `${sep}src${sep}readmap${sep}mappers${sep}`;
          if (!actualPath.includes(mapperSuffix)) return actualPath;
          const name = basename(actualPath);
          if (name === "python.ts" || name === "python.js") {
            return join(packageRoot, "src/readmap/mappers/python.ts");
          }
          if (name === "go.ts" || name === "go.js") {
            return join(packageRoot, "src/readmap/mappers/go.ts");
          }
          return actualPath;
        },
      }));

      const { generateMapWithIdentity } = await import("../src/readmap/mapper.js");

      const pythonResult = await generateMapWithIdentity(pythonFixture);
      expect(pythonResult.mapperName).toBe("python");
      expect(pythonResult.map?.language).toBe("Python");
      expect(pythonResult.map?.symbols.map((symbol) => symbol.name)).toContain("hello");

      if (await goAvailable()) {
        const goResult = await generateMapWithIdentity(goFixture);
        expect(goResult.mapperName).toBe("go");
        expect(goResult.map?.language).toBe("Go");
        expect(goResult.map?.symbols.map((symbol) => symbol.name)).toContain("Hello");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
