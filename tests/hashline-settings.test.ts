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

export function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("resolveHashlineJsonSettings", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("treats missing settings files as empty settings", () => {
    const root = tempRoot("hashline-settings-missing");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });

    expect(resolveHashlineJsonSettings()).toEqual({ settings: {}, warnings: [] });
  });

  it("reads the global Hashline settings file", async () => {
    const root = tempRoot("hashline-settings-global");
    cleanup.push(root);
    const globalSettingsPath = join(root, "home/.pi/agent/hashline-readmap/settings.json");
    await mkdir(join(globalSettingsPath, ".."), { recursive: true });
    await writeFile(globalSettingsPath, JSON.stringify({ grep: { maxLines: 12 } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath,
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });

    expect(resolveHashlineJsonSettings().settings.grep?.maxLines).toBe(12);
  });

  it("reads the project Hashline settings file", async () => {
    const root = tempRoot("hashline-settings-project");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ grep: { maxBytes: 1024 } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    expect(resolveHashlineJsonSettings().settings.grep?.maxBytes).toBe(1024);
  });

  it("merges project settings over global settings field-by-field", async () => {
    const root = tempRoot("hashline-settings-merge");
    cleanup.push(root);
    const globalSettingsPath = join(root, "home/.pi/agent/hashline-readmap/settings.json");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(globalSettingsPath, ".."), { recursive: true });
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(globalSettingsPath, JSON.stringify({ grep: { maxLines: 100, maxBytes: 2000 } }));
    await writeFile(projectSettingsPath, JSON.stringify({ grep: { maxLines: 25 } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath, projectSettingsPath });

    expect(resolveHashlineJsonSettings().settings.grep).toEqual({ maxLines: 25, maxBytes: 2000 });
  });

  it("ignores malformed project JSON and reports a warning", async () => {
    const root = tempRoot("hashline-settings-malformed-project");
    cleanup.push(root);
    const globalSettingsPath = join(root, "home/.pi/agent/hashline-readmap/settings.json");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(globalSettingsPath, ".."), { recursive: true });
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(globalSettingsPath, JSON.stringify({ grep: { maxLines: 10 } }));
    await writeFile(projectSettingsPath, "{not json");
    __setHashlineSettingsPathsForTest({ globalSettingsPath, projectSettingsPath });

    const result = resolveHashlineJsonSettings();
    expect(result.settings.grep?.maxLines).toBe(10);
    expect(result.warnings[0].message).toContain("Invalid JSON");
  });


  it("ignores invalid field values without discarding valid fields", async () => {
    const root = tempRoot("hashline-settings-invalid-fields");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, `{
      "grep": { "maxLines": 1e3, "maxBytes": 1.5 },
      "mapCache": { "dir": "", "enabled": "no" },
      "bashContextGuard": { "enabled": false, "maxLines": 1e3, "maxBytes": 1.5, "headLines": 0, "tailLines": 5 }
    }`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    const result = resolveHashlineJsonSettings();
    expect(result.settings).toEqual({
      bashContextGuard: { enabled: false, tailLines: 5 },
    });
    expect(result.warnings.map((warning) => warning.path)).toEqual([
      "grep.maxLines",
      "grep.maxBytes",
      "mapCache.dir",
      "mapCache.enabled",
      "bashContextGuard.maxLines",
      "bashContextGuard.maxBytes",
      "bashContextGuard.headLines",
    ]);
  });

  it("rejects duplicate numeric JSON fields instead of accepting a mismatched parsed value", async () => {
    const root = tempRoot("hashline-settings-duplicate-fields");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, `{
      "grep": { "maxLines": 12, "maxLines": 0 },
      "bashContextGuard": { "tailLines": 5, "tailLines": 1e3 }
    }`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    const result = resolveHashlineJsonSettings();
    expect(result.settings).toEqual({});
    expect(result.warnings.map((warning) => warning.path)).toEqual([
      "grep.maxLines",
      "bashContextGuard.tailLines",
    ]);
  });

  it("rejects duplicate top-level numeric sections instead of validating the wrong token", async () => {
    const root = tempRoot("hashline-settings-duplicate-sections");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, `{
      "grep": { "maxLines": 12 },
      "grep": { "maxLines": 1e3 }
    }`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    const result = resolveHashlineJsonSettings();
    expect(result.settings).toEqual({});
    expect(result.warnings.map((warning) => warning.path)).toEqual(["grep.maxLines"]);
  });

  it("ignores nested same-named sections when validating top-level numeric fields", async () => {
    const root = tempRoot("hashline-settings-nested-section");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, `{
      "metadata": { "grep": { "maxLines": 12 } },
      "grep": { "maxLines": 1e3 }
    }`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    const result = resolveHashlineJsonSettings();
    expect(result.settings).toEqual({});
    expect(result.warnings.map((warning) => warning.path)).toEqual(["grep.maxLines"]);
  });


  it("does not let unknown nested JSON content invalidate supported numeric fields", async () => {
    const root = tempRoot("hashline-settings-unknown-nested");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, `{
      "grep": { "note": "literal } brace", "nested": { "maxLines": 0 }, "maxLines": 12, "maxBytes": 1024 },
      "bashContextGuard": { "nested": { "tailLines": 0 }, "tailLines": 5 }
    }`);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    const result = resolveHashlineJsonSettings();
    expect(result.settings.grep).toEqual({ maxLines: 12, maxBytes: 1024 });
    expect(result.settings.bashContextGuard).toEqual({ tailLines: 5 });
    expect(result.warnings).toEqual([]);
  });

  it("ignores old and alias settings paths when canonical files are missing", async () => {
    const root = tempRoot("hashline-settings-excluded");
    cleanup.push(root);
    const oldGlobal = join(root, "home/.pi/agent/settings.json");
    const oldProject = join(root, "repo/.pi/settings.json");
    const aliasGlobal = join(root, "home/.pi/hashline-readmap/settings.json");
    const aliasProject = join(root, "repo/.pi/hashline-readmap.json");
    for (const path of [oldGlobal, oldProject, aliasGlobal, aliasProject]) {
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, JSON.stringify({ grep: { maxLines: 99 } }));
    }
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });

    expect(resolveHashlineJsonSettings()).toEqual({ settings: {}, warnings: [] });
  });

  it("ignores malformed global JSON and still uses project settings", async () => {
    const root = tempRoot("hashline-settings-malformed-global");
    cleanup.push(root);
    const globalSettingsPath = join(root, "home/.pi/agent/hashline-readmap/settings.json");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(globalSettingsPath, ".."), { recursive: true });
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(globalSettingsPath, "{not json");
    await writeFile(projectSettingsPath, JSON.stringify({ grep: { maxLines: 10 } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath, projectSettingsPath });

    const result = resolveHashlineJsonSettings();
    expect(result.settings.grep?.maxLines).toBe(10);
    expect(result.warnings[0].message).toContain("Invalid JSON");
  });


  it("accepts boolean gdscript.enabled settings", async () => {
    const root = tempRoot("hashline-settings-gdscript-enabled");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ gdscript: { enabled: true } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    expect(resolveHashlineJsonSettings()).toEqual({
      settings: { gdscript: { enabled: true } },
      warnings: [],
    });
  });

  it("ignores invalid gdscript.enabled values with a settings warning", async () => {
    const root = tempRoot("hashline-settings-gdscript-invalid");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ gdscript: { enabled: "yes" } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    const result = resolveHashlineJsonSettings();
    expect(result.settings).toEqual({});
    expect(result.warnings.map((warning) => warning.path)).toEqual(["gdscript.enabled"]);
  });
});
