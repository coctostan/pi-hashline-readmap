import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("GDScript missing backend diagnostic", () => {
  const cleanup: string[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("returns null and emits install guidance when helper reports missing gdtoolkit", async () => {
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, JSON.stringify({ error: "missing gdtoolkit.parser" }), "");
    });
    vi.doMock("node:child_process", () => ({ execFile }));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const root = tempRoot("gdscript-missing-backend");
    cleanup.push(root);
    await mkdir(root, { recursive: true });
    const filePath = join(root, "Player.gd");
    await writeFile(filePath, "func _ready():\n\tpass\n");

    const { gdscriptMapper } = await import("../src/readmap/mappers/gdscript.js");
    await expect(gdscriptMapper(filePath)).resolves.toBeNull();
    expect(error.mock.calls.map((call) => String(call[0])).join("\n")).toContain(
      "GDScript support requires pip install gdtoolkit or disabling PI_HASHLINE_GDSCRIPT",
    );
  });
});
