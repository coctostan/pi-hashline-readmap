import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest } from "../src/hashline-settings.js";

function tempRoot(prefix: string): string { return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`); }

describe("disabled GDScript mapper gate", () => {
  const cleanup: string[] = [];
  const originalEnv = process.env.PI_HASHLINE_GDSCRIPT;
  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.PI_HASHLINE_GDSCRIPT;
    else process.env.PI_HASHLINE_GDSCRIPT = originalEnv;
    __resetHashlineSettingsPathsForTest();
    vi.restoreAllMocks();
    vi.resetModules();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("does not invoke the dedicated mapper when JSON explicitly disables GDScript", async () => {
    delete process.env.PI_HASHLINE_GDSCRIPT;
    const root = tempRoot("gdscript-disabled-gate");
    cleanup.push(root);
    await mkdir(root, { recursive: true });
    const filePath = join(root, "Player.gd");
    await writeFile(filePath, "func _ready():\n\tpass\n");
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ gdscript: { enabled: false } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    const gdscriptMapper = vi.fn(async () => { throw new Error("GDScript backend should not be invoked"); });
    vi.doMock("../src/readmap/mappers/gdscript.js", () => ({ MAPPER_VERSION: 1, gdscriptMapper }));

    const { generateMapWithIdentity } = await import("../src/readmap/mapper.js");
    const result = await generateMapWithIdentity(filePath);

    expect(gdscriptMapper).not.toHaveBeenCalled();
    expect(["ctags", "fallback"]).toContain(result.mapperName);
  });
});
