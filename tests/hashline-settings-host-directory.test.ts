import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { it, vi } from "vitest";

type HostFixture = {
  settings: typeof import("../src/hashline-settings.js");
  root: string;
  globalPath: string;
  projectPath: string;
  save: (path: string, value: unknown) => void;
};
async function withHostDirectory(
  configDir: string,
  run: (fixture: HostFixture) => void | Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "hashline-host-config-"));
  const actualPi = await vi.importActual<typeof import("@earendil-works/pi-coding-agent")>(
    "@earendil-works/pi-coding-agent",
  );
  const actualOs = await vi.importActual<typeof import("node:os")>("node:os");
  vi.resetModules();
  const home = join(root, "home");
  const cwd = join(root, "repo");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  vi.doMock("@earendil-works/pi-coding-agent", () => ({
    ...actualPi, CONFIG_DIR_NAME: configDir,
  }));
  vi.doMock("node:os", () => ({ ...actualOs, homedir: () => home }));
  const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(cwd);
  let settings: HostFixture["settings"] | undefined;
  try {
    settings = await import("../src/hashline-settings.js");
    settings.__resetHashlineSettingsPathsForTest();
    const globalPath = join(home, configDir, "agent", "hashline-readmap", "settings.json");
    const projectPath = join(cwd, configDir, "hashline-readmap", "settings.json");
    const save = (path: string, value: unknown): void => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(value));
    };
    await run({ settings, root, globalPath, projectPath, save });
  } finally {
    settings?.__resetHashlineSettingsPathsForTest();
    settings?.__setPiShellPathReaderForTest(undefined);
    cwdSpy.mockRestore();
    vi.doUnmock("@earendil-works/pi-coding-agent");
    vi.doUnmock("node:os");
    vi.resetModules();
    rmSync(root, { recursive: true, force: true });
  }
}
it("loads default settings under the host configuration directory", async () => {
  for (const configDir of [".pi", ".alternate-pi"]) {
    await withHostDirectory(configDir, ({ settings, globalPath, projectPath, save }) => {
      save(globalPath, { grep: { maxLines: 100, maxBytes: 2048 } });
      save(projectPath, { grep: { maxLines: 7 } });
      // No call to __setHashlineSettingsPathsForTest during these checks.
      assert.equal(settings.resolveHashlineJsonSettings().settings.grep?.maxLines, 7);
      assert.deepEqual(settings.resolveHashlineJsonSettings().settings.grep,
        { maxLines: 7, maxBytes: 2048 });
    });
  }
});

const globalValues = {
  grep: { maxLines: 100, maxBytes: 2048 },
  gdscript: { enabled: true },
  edit: { diffDisplay: "collapsed" },
  display: { previewLines: 2 },
  bash: { shellPath: "/global-shell" },
};
const projectValues = {
  grep: { maxLines: 7, maxBytes: "bad" },
  gdscript: { enabled: false },
  edit: { diffDisplay: "expanded" },
  display: { previewLines: 3 },
  bash: { shellPath: "/project-shell" },
};
it("preserves field-wise merging and invalid-project warning sources", async () => {
  await withHostDirectory(".pi", ({ settings, globalPath, projectPath, save }) => {
    save(globalPath, globalValues);
    save(projectPath, projectValues);
    const merged = settings.resolveHashlineJsonSettings();
    assert.deepEqual(merged.settings, {
      grep: { maxLines: 7, maxBytes: 2048 },
      gdscript: { enabled: false },
      edit: { diffDisplay: "expanded" },
      display: { previewLines: 3 },
      bash: { shellPath: "/project-shell" },
    });
    assert.deepEqual(merged.warnings.map(w => [w.source, w.path]), [[projectPath, "grep.maxBytes"]]);
    save(projectPath, {
      grep: { maxLines: -1, maxBytes: "bad" },
      gdscript: { enabled: "bad" },
      edit: { diffDisplay: "invalid" },
      display: { previewLines: -1 },
      bash: { shellPath: "" },
    });
    const invalid = settings.resolveHashlineJsonSettings();
    assert.deepEqual(invalid.settings, globalValues);
    assert.equal(invalid.warnings.length, 6);
    assert.ok(invalid.warnings.every(w => w.source === projectPath &&
      w.message.startsWith("Invalid hashline setting at ")));
  });
});
it("preserves malformed-project warnings without erasing global values", async () => {
  await withHostDirectory(".pi", ({ settings, globalPath, projectPath, save }) => {
    save(globalPath, globalValues);
    save(projectPath, projectValues);
    writeFileSync(projectPath, "{");
    const malformed = settings.resolveHashlineJsonSettings();
    assert.deepEqual(malformed.settings, globalValues);
    assert.equal(malformed.warnings.length, 1);
    assert.equal(malformed.warnings[0]?.source, projectPath);
    assert.ok(malformed.warnings[0]?.message.startsWith("Invalid JSON:"));
    rmSync(globalPath);
    rmSync(projectPath);
    assert.deepEqual(settings.resolveHashlineJsonSettings(), { settings: {}, warnings: [] });
  });
});

it("preserves independent and combined settings-file override precedence", async () => {
  for (const configDir of [".pi", ".alternate-pi"]) {
    await withHostDirectory(configDir, ({ settings, root, globalPath, projectPath, save }) => {
      save(globalPath, globalValues);
      save(projectPath, projectValues);
      const overrideGlobal = join(root, "override-global.json");
      const overrideProject = join(root, "override-project.json");
      save(overrideGlobal, { grep: { maxBytes: 4096 }, display: { previewLines: 4 } });
      save(overrideProject, { grep: { maxLines: 11 }, edit: { diffDisplay: "collapsed" } });
      settings.__setHashlineSettingsPathsForTest({ globalSettingsPath: overrideGlobal });
      assert.deepEqual(settings.resolveHashlineJsonSettings().settings.grep,
        { maxLines: 7, maxBytes: 4096 });
      // This replaces the previous override; global must return to its default.
      settings.__setHashlineSettingsPathsForTest({ projectSettingsPath: overrideProject });
      assert.deepEqual(settings.resolveHashlineJsonSettings().settings.grep,
        { maxLines: 11, maxBytes: 2048 });
      assert.equal(settings.resolveEditDiffDisplay({}), "collapsed");
      settings.__setHashlineSettingsPathsForTest({
        globalSettingsPath: overrideGlobal, projectSettingsPath: overrideProject,
      });
      assert.deepEqual(settings.resolveHashlineJsonSettings().settings.grep,
        { maxLines: 11, maxBytes: 4096 });
      assert.equal(settings.resolvePreviewLines({}), 4);
      settings.__resetHashlineSettingsPathsForTest();
    });
  }
});

it("preserves GDScript environment precedence including invalid-env disablement", async () => {
  await withHostDirectory(".pi", ({ settings, globalPath, projectPath, save }) => {
    assert.equal(settings.isGdscriptMappingEnabled({}), false);
    save(globalPath, globalValues);
    save(projectPath, projectValues);
    assert.equal(settings.isGdscriptMappingEnabled({}), false);
    assert.equal(settings.isGdscriptMappingEnabled({ PI_HASHLINE_GDSCRIPT: "1" }), true);
    assert.equal(settings.isGdscriptMappingEnabled({ PI_HASHLINE_GDSCRIPT: "invalid" }), false);
    rmSync(projectPath);
    assert.equal(settings.isGdscriptMappingEnabled({}), true);
    // Any defined value other than "1" disables mapping, even over true JSON.
    assert.equal(settings.isGdscriptMappingEnabled({ PI_HASHLINE_GDSCRIPT: "invalid" }), false);
  });
});
it("preserves edit-display environment precedence and invalid-env fallback", async () => {
  await withHostDirectory(".pi", ({ settings, globalPath, projectPath, save }) => {
    assert.equal(settings.resolveEditDiffDisplay({}), "collapsed");
    save(globalPath, globalValues);
    save(projectPath, projectValues);
    assert.equal(settings.resolveEditDiffDisplay({}), "expanded");
    assert.equal(settings.resolveEditDiffDisplay({ PI_HASHLINE_EDIT_DIFF_DISPLAY: " collapsed " }), "collapsed");
    assert.equal(settings.resolveEditDiffDisplay({ PI_HASHLINE_EDIT_DIFF_DISPLAY: "invalid" }), "expanded");
    rmSync(globalPath);
    rmSync(projectPath);
    assert.equal(settings.resolveEditDiffDisplay({ PI_HASHLINE_EDIT_DIFF_DISPLAY: "invalid" }), "collapsed");
  });
});
it("preserves preview-lines environment precedence and invalid-env fallback", async () => {
  await withHostDirectory(".pi", ({ settings, globalPath, projectPath, save }) => {
    assert.equal(settings.resolvePreviewLines({}), 5);
    save(globalPath, globalValues);
    save(projectPath, projectValues);
    assert.equal(settings.resolvePreviewLines({}), 3);
    assert.equal(settings.resolvePreviewLines({ PI_HASHLINE_PREVIEW_LINES: "0" }), 0);
    assert.equal(settings.resolvePreviewLines({ PI_HASHLINE_PREVIEW_LINES: "invalid" }), 3);
    rmSync(globalPath);
    rmSync(projectPath);
    assert.equal(settings.resolvePreviewLines({ PI_HASHLINE_PREVIEW_LINES: "invalid" }), 5);
  });
});
it("preserves shell environment precedence and host-reader fallbacks", async () => {
  await withHostDirectory(".pi", ({ settings, globalPath, projectPath, save }) => {
    settings.__setPiShellPathReaderForTest(() => "/pi-shell");
    assert.equal(settings.resolveShellPath({}), "/pi-shell");
    save(globalPath, globalValues);
    save(projectPath, projectValues);
    assert.equal(settings.resolveShellPath({}), "/project-shell");
    assert.equal(settings.resolveShellPath({ PI_HASHLINE_SHELL_PATH: " /env-shell " }), "/env-shell");
    assert.equal(settings.resolveShellPath({ PI_HASHLINE_SHELL_PATH: " " }), "/project-shell");
    rmSync(globalPath);
    rmSync(projectPath);
    assert.equal(settings.resolveShellPath({ PI_HASHLINE_SHELL_PATH: " " }), "/pi-shell");
    settings.__setPiShellPathReaderForTest(() => { throw new Error("host settings unavailable"); });
    assert.equal(settings.resolveShellPath({}), undefined);
  });
});
