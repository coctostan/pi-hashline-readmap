import { afterEach, describe, expect, it } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import {
  __resetHashlineSettingsPathsForTest,
  __setHashlineSettingsPathsForTest,
  resolvePreviewLines,
} from "../src/hashline-settings.js";

function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("resolvePreviewLines", () => {
  const cleanup: string[] = [];
  const originalEnv = process.env.PI_HASHLINE_PREVIEW_LINES;
  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_PREVIEW_LINES;
    else process.env.PI_HASHLINE_PREVIEW_LINES = originalEnv;
    __resetHashlineSettingsPathsForTest();
    await Promise.all(cleanup.map((p) => rm(p, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("defaults to 5 when nothing is configured", () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const root = tempRoot("preview-default");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });
    expect(resolvePreviewLines()).toBe(5);
  });

  it("uses the JSON value when env is unset", async () => {
    delete process.env.PI_HASHLINE_PREVIEW_LINES;
    const root = tempRoot("preview-json");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ display: { previewLines: 3 } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });
    expect(resolvePreviewLines()).toBe(3);
  });

  it("lets PI_HASHLINE_PREVIEW_LINES override JSON, including 0", async () => {
    process.env.PI_HASHLINE_PREVIEW_LINES = "0";
    const root = tempRoot("preview-env-over-json");
    cleanup.push(root);
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ display: { previewLines: 9 } }));
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath,
    });
    expect(resolvePreviewLines()).toBe(0);
  });

  it("ignores an invalid env value and falls through to default", () => {
    process.env.PI_HASHLINE_PREVIEW_LINES = "abc";
    const root = tempRoot("preview-env-invalid");
    cleanup.push(root);
    __setHashlineSettingsPathsForTest({
      globalSettingsPath: join(root, "home/.pi/agent/hashline-readmap/settings.json"),
      projectSettingsPath: join(root, "repo/.pi/hashline-readmap/settings.json"),
    });
    expect(resolvePreviewLines()).toBe(5);
  });
});
