import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  resolveHashlineJsonSettings,
} from "../src/hashline-settings.js";

function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("display.previewLines settings validation", () => {
  const cleanup: string[] = [];
  afterEach(async () => {
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((p) => rm(p, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  async function writeProject(root: string, value: unknown): Promise<string> {
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ display: { previewLines: value } }));
    return projectSettingsPath;
  }

  it("accepts a positive integer display.previewLines without warnings", async () => {
    const root = tempRoot("preview-lines-positive");
    cleanup.push(root);
    const projectSettingsPath = await writeProject(root, 8);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });
    const result = resolveHashlineJsonSettings();
    expect(result.settings.display?.previewLines).toBe(8);
    expect(result.warnings).toEqual([]);
  });

  it("accepts display.previewLines = 0 (escape hatch) without warnings", async () => {
    const root = tempRoot("preview-lines-zero");
    cleanup.push(root);
    const projectSettingsPath = await writeProject(root, 0);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });
    const result = resolveHashlineJsonSettings();
    expect(result.settings.display?.previewLines).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("warns and drops an invalid display.previewLines value", async () => {
    const root = tempRoot("preview-lines-invalid");
    cleanup.push(root);
    const projectSettingsPath = await writeProject(root, -2);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });
    const result = resolveHashlineJsonSettings();
    expect(result.settings).toEqual({});
    expect(result.warnings.map((w) => w.path)).toEqual(["display.previewLines"]);
  });
});
