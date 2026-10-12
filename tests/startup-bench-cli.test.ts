import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = "scripts/bench-startup.mjs";

describe("bench-startup CLI", () => {
  it("prints the full run plan without running pi under --dry-run", () => {
    const stdout = execFileSync(
      process.execPath,
      [script, "--dry-run", "--runs", "3", "--lazy-dir", "/tmp/lazy", "--bundle-dir", "/tmp/bundle"],
      { encoding: "utf8" },
    );
    const lines = stdout.trim().split("\n");
    expect(lines).toHaveLength(8);
    expect(lines).toContain(
      `b warm x3 (+1 warm-up): pi --no-session --no-extensions -e ${join(process.cwd(), "index.ts")} --list-models`,
    );
    expect(lines).toContain(
      "d cold x3: pi --no-session --no-extensions -e /tmp/bundle --list-models [JITI_FS_CACHE=false]",
    );
  });

  it("rejects fewer than 3 runs", () => {
    const result = spawnSync(process.execPath, [script, "--dry-run", "--runs", "2"], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("runs must be an integer >= 3");
  });
});
