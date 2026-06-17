import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  __setPiShellPathReaderForTest,
  resolveShellPath,
} from "../src/hashline-settings.js";

function tempRoot(prefix: string): string { return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`); }

describe("resolveShellPath (pi SettingsManager fallback)", () => {
  const originalEnv = process.env.PI_HASHLINE_SHELL_PATH;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_SHELL_PATH;
    else process.env.PI_HASHLINE_SHELL_PATH = originalEnv;
    __resetHashlineSettingsPathsForTest();
    __setPiShellPathReaderForTest(undefined);
  });

  function withEmptyJson(prefix: string): void {
    const root = tempRoot(prefix);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "missing-global.json"),
      projectSettingsPath: join(root, "missing-project.json"),
    });
  }

  it("uses pi's shellPath when env and JSON are unset", () => {
    delete process.env.PI_HASHLINE_SHELL_PATH;
    withEmptyJson("shellpath-pi-only");
    __setPiShellPathReaderForTest(() => "/pi/git/bin/bash");
    expect(resolveShellPath({})).toBe("/pi/git/bin/bash");
  });

  it("prefers env over pi's shellPath", () => {
    withEmptyJson("shellpath-env-over-pi");
    __setPiShellPathReaderForTest(() => "/pi/git/bin/bash");
    expect(resolveShellPath({ PI_HASHLINE_SHELL_PATH: "/env/git/bin/bash" })).toBe("/env/git/bin/bash");
  });

  it("returns undefined when pi reader throws", () => {
    delete process.env.PI_HASHLINE_SHELL_PATH;
    withEmptyJson("shellpath-pi-throws");
    __setPiShellPathReaderForTest(() => { throw new Error("boom"); });
    expect(resolveShellPath({})).toBeUndefined();
  });
});
