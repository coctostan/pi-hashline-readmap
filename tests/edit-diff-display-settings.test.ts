import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  resolveEditDiffDisplay,
} from "../src/hashline-settings.js";

function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("resolveEditDiffDisplay", () => {
  const cleanup: string[] = [];
  const originalEnv = process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    else process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = originalEnv;
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("defaults to \"collapsed\" when no JSON setting and no env override are present", () => {
    delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    const root = tempRoot("edit-diff-display-default");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });

    expect(resolveEditDiffDisplay()).toBe("collapsed");
  });

  it("returns the JSON-resolved value when PI_HASHLINE_EDIT_DIFF_DISPLAY is unset", async () => {
    delete process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY;
    const root = tempRoot("edit-diff-display-json-only");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ edit: { diffDisplay: "expanded" } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    expect(resolveEditDiffDisplay()).toBe("expanded");
  });

  it("lets PI_HASHLINE_EDIT_DIFF_DISPLAY override the JSON-resolved value", async () => {
    process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = "collapsed";
    const root = tempRoot("edit-diff-display-env-over-json");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ edit: { diffDisplay: "expanded" } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });

    expect(resolveEditDiffDisplay()).toBe("collapsed");
  });

  it("returns \"expanded\" when only PI_HASHLINE_EDIT_DIFF_DISPLAY=expanded is set", () => {
    process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = "expanded";
    const root = tempRoot("edit-diff-display-env-only");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });

    expect(resolveEditDiffDisplay()).toBe("expanded");
  });

  it.each([
    ["expanded", "expanded"],
    ["EXPANDED", "expanded"],
    ["Expanded", "expanded"],
    ["  expanded  ", "expanded"],
    ["collapsed", "collapsed"],
    ["COLLAPSED", "collapsed"],
    ["  Collapsed\n", "collapsed"],
  ])("normalizes PI_HASHLINE_EDIT_DIFF_DISPLAY=%j to %s", (raw, expected) => {
    process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = raw;
    const root = tempRoot("edit-diff-display-env-case");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });

    expect(resolveEditDiffDisplay()).toBe(expected);
  });

  it.each(["1", "0", "true", "false", "auto", "", "yes", "no"])(
    "ignores unrecognized PI_HASHLINE_EDIT_DIFF_DISPLAY=%j and falls through to JSON then default",
    async (raw) => {
      process.env.PI_HASHLINE_EDIT_DIFF_DISPLAY = raw;
      const root1 = tempRoot("edit-diff-display-env-unknown-default");
      cleanup.push(root1);
      __setHashlineSettingsPathsForTest({
        globalSettingsPath: join(root1, "home/.pi/agent/hashline-readmap/settings.json"),
        projectSettingsPath: join(root1, "repo/.pi/hashline-readmap/settings.json"),
      });
      expect(resolveEditDiffDisplay()).toBe("collapsed");

      const root2 = tempRoot("edit-diff-display-env-unknown-json");
      cleanup.push(root2);
      const projectSettingsPath = join(root2, "repo/.pi/hashline-readmap/settings.json");
      await mkdir(join(projectSettingsPath, ".."), { recursive: true });
      await writeFile(projectSettingsPath, JSON.stringify({ edit: { diffDisplay: "expanded" } }));
      __setHashlineSettingsPathsForTest({
        globalSettingsPath: join(root2, "home/.pi/agent/hashline-readmap/settings.json"),
        projectSettingsPath,
      });
      expect(resolveEditDiffDisplay()).toBe("expanded");
    },
  );
});
