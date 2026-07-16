import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  resolveContextHygieneStaleResults,
  resolveHashlineJsonSettings,
} from "../src/hashline-settings.js";

function tempRoot(): string {
  return join(tmpdir(), `hashline-context-hygiene-settings-${randomBytes(6).toString("hex")}`);
}

const cleanup: string[] = [];

afterEach(async () => {
  __resetHashlineSettingsPathsForTest();
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("contextHygiene.staleResults", () => {
  it("defaults to replace so existing stale-context behavior is preserved", () => {
    const root = tempRoot();
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "missing-global.json"),
      projectSettingsPath: join(root, "missing-project.json"),
    });

    expect(resolveContextHygieneStaleResults()).toBe("replace");
  });

  it("resolves append-only from project JSON", async () => {
    const root = tempRoot();
    cleanup.push(root);
    const projectSettingsPath = join(root, ".pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ contextHygiene: { staleResults: "append-only" } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "missing-global.json"),
      projectSettingsPath,
    });

    expect(resolveContextHygieneStaleResults()).toBe("append-only");
  });

  it.each(["replace", "disabled"] as const)("resolves %s from project JSON", async (mode) => {
    const root = tempRoot();
    cleanup.push(root);
    const projectSettingsPath = join(root, ".pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ contextHygiene: { staleResults: mode } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "missing-global.json"),
      projectSettingsPath,
    });

    expect(resolveContextHygieneStaleResults()).toBe(mode);
  });

  it("drops invalid modes with a field-specific warning", async () => {
    const root = tempRoot();
    cleanup.push(root);
    const projectSettingsPath = join(root, ".pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ contextHygiene: { staleResults: "automatic" } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "missing-global.json"),
      projectSettingsPath,
    });

    const result = resolveHashlineJsonSettings();
    expect(result.settings.contextHygiene).toBeUndefined();
    expect(result.warnings.map((warning) => warning.path)).toEqual(["contextHygiene.staleResults"]);
  });

  it("lets the project mode override the global mode", async () => {
    const root = tempRoot();
    cleanup.push(root);
    const globalSettingsPath = join(root, "global/settings.json");
    const projectSettingsPath = join(root, "project/settings.json");
    await Promise.all([
      mkdir(join(globalSettingsPath, ".."), { recursive: true }),
      mkdir(join(projectSettingsPath, ".."), { recursive: true }),
    ]);
    await writeFile(globalSettingsPath, JSON.stringify({ contextHygiene: { staleResults: "disabled" } }));
    await writeFile(projectSettingsPath, JSON.stringify({ contextHygiene: { staleResults: "append-only" } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath, projectSettingsPath });

    expect(resolveContextHygieneStaleResults()).toBe("append-only");
  });
});
