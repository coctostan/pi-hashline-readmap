import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest, isGdscriptMappingEnabled } from "../src/hashline-settings.js";

function tempRoot(prefix: string): string { return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`); }

describe("PI_HASHLINE_GDSCRIPT precedence", () => {
  const cleanup: string[] = [];
  const originalEnv = process.env.PI_HASHLINE_GDSCRIPT;
  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_GDSCRIPT;
    else process.env.PI_HASHLINE_GDSCRIPT = originalEnv;
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("lets PI_HASHLINE_GDSCRIPT=1 override disabled JSON", async () => {
    process.env.PI_HASHLINE_GDSCRIPT = "1";
    const root = tempRoot("gdscript-settings-env-over-json");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ gdscript: { enabled: false } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });

    expect(isGdscriptMappingEnabled()).toBe(true);
  });
});
