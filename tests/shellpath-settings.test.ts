import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  resolveShellPath,
} from "../src/hashline-settings.js";

function tempRoot(prefix: string): string { return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`); }

describe("resolveShellPath (env + JSON)", () => {
  const cleanup: string[] = [];
  const originalEnv = process.env.PI_HASHLINE_SHELL_PATH;
  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_SHELL_PATH;
    else process.env.PI_HASHLINE_SHELL_PATH = originalEnv;
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("returns undefined when nothing is configured", () => {
    delete process.env.PI_HASHLINE_SHELL_PATH;
    const root = tempRoot("shellpath-none");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });
    expect(resolveShellPath({})).toBeUndefined();
  });

  it("reads bash.shellPath from project JSON", async () => {
    const root = tempRoot("shellpath-json");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ bash: { shellPath: "/json/git/bin/bash" } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    expect(resolveShellPath({})).toBe("/json/git/bin/bash");
  });

  it("lets PI_HASHLINE_SHELL_PATH override JSON", async () => {
    const root = tempRoot("shellpath-env-over-json");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ bash: { shellPath: "/json/git/bin/bash" } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    expect(resolveShellPath({ PI_HASHLINE_SHELL_PATH: "/env/git/bin/bash" })).toBe("/env/git/bin/bash");
  });

  it("ignores empty/whitespace env values and falls through to JSON", async () => {
    const root = tempRoot("shellpath-empty-env");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ bash: { shellPath: "/json/git/bin/bash" } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    expect(resolveShellPath({ PI_HASHLINE_SHELL_PATH: "   " })).toBe("/json/git/bin/bash");
  });
});
