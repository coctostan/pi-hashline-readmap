import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest, isGdscriptMappingEnabled } from "../src/hashline-settings.js";

function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("isGdscriptMappingEnabled JSON settings", () => {
  const cleanup: string[] = [];
  afterEach(async () => {
    delete process.env.PI_HASHLINE_GDSCRIPT;
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("uses project gdscript.enabled over global gdscript.enabled", async () => {
    delete process.env.PI_HASHLINE_GDSCRIPT;
    const root = tempRoot("gdscript-settings-project-over-global");
    cleanup.push(root);
    const globalSettingsPath = join(root, "home/.pi/agent/hashline-readmap/settings.json");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(globalSettingsPath, ".."), { recursive: true });
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(globalSettingsPath, JSON.stringify({ gdscript: { enabled: false } }));
    await writeFile(projectSettingsPath, JSON.stringify({ gdscript: { enabled: true } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath, projectSettingsPath });

    expect(isGdscriptMappingEnabled()).toBe(true);
  });
});
