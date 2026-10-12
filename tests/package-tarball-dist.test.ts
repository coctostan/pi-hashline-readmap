import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundle } from "../scripts/build.mjs";
import { PI_COMPAT_VERSION, runDistScenario } from "./helpers/pi-host-dist-harness.js";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const hasPython = spawnSync("python3", ["--version"]).status === 0;
const PYTHON_STUB = [
  "import os",
  'open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ran.marker"), "w").write("1")',
  'print("{}")',
  "",
].join("\n");

describe("npm pack tarball", () => {
  it("ships dist, prompts and outline scripts, and the extracted package loads and runs them", async () => {
    const work = mkdtempSync(join(tmpdir(), "pi-tarball-"));
    try {
      const stage = join(work, "stage");
      mkdirSync(stage);
      writeFileSync(join(stage, "package.json"), JSON.stringify(pkg));
      for (const entry of pkg.files as string[]) {
        if (entry === "dist/") continue;
        mkdirSync(dirname(join(stage, entry)), { recursive: true });
        cpSync(entry, join(stage, entry), { recursive: true });
      }
      await buildBundle({ outDir: join(stage, "dist") });

      const packed = JSON.parse(
        execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", work], { cwd: stage, encoding: "utf8" }),
      );
      const info = Array.isArray(packed) ? packed[0] : packed[pkg.name];
      const names = new Set<string>(info.files.map((file: { path: string }) => file.path));
      for (const required of [
        "dist/index.js",
        "dist/package.json",
        "prompts/read.md",
        "scripts/python_outline.py",
        "scripts/go_outline.go",
        "scripts/gdscript_outline.py",
      ]) {
        expect(names.has(required), required).toBe(true);
      }

      const extractDir = join(work, "extract");
      mkdirSync(extractDir);
      execFileSync("tar", ["-xzf", join(work, info.filename), "-C", extractDir]);
      const pkgRoot = join(extractDir, "package");
      if (hasPython) writeFileSync(join(pkgRoot, "scripts/python_outline.py"), PYTHON_STUB);

      const stdout = runDistScenario("extracted", {
        PI_TEST_PKG_DIR: pkgRoot,
        PI_HASHLINE_NO_PERSIST_MAPS: "1",
        ...(hasPython ? { PI_TEST_RUN_PY_MAP: "1" } : {}),
      });
      expect(stdout).toContain("scenario=extracted=PASS");
      if (process.env.PI_COMPAT_HOST) expect(stdout).toContain(`host-version=${PI_COMPAT_VERSION};`);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }, 180_000);
});
