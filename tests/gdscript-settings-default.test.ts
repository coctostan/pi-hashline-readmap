import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  isGdscriptMappingEnabled,
} from "../src/hashline-settings.js";

function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("isGdscriptMappingEnabled default", () => {
  const cleanup: string[] = [];
  afterEach(async () => {
    delete process.env.PI_HASHLINE_GDSCRIPT;
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("defaults to disabled when JSON and env are absent", () => {
    delete process.env.PI_HASHLINE_GDSCRIPT;
    const root = tempRoot("gdscript-settings-default");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });

    expect(isGdscriptMappingEnabled()).toBe(false);
  });
});
