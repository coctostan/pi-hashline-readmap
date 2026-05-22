import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { SymbolKind } from "../src/readmap/enums.js";

function tempRoot(prefix: string): string {
  return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`);
}

describe("gdscriptMapper", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("invokes the Python helper with execFile args and maps helper JSON", async () => {
    const execFile = vi.fn((file: string, args: readonly string[], options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, JSON.stringify({
        imports: ["res://enemy.gd"],
        symbols: [
          { name: "Player", kind: "class", startLine: 1, endLine: 9 },
          { name: "health_changed", kind: "signal", startLine: 3, endLine: 3 },
          { name: "MAX_SPEED", kind: "constant", startLine: 4, endLine: 4 },
          { name: "velocity", kind: "variable", startLine: 5, endLine: 5 },
          { name: "_ready", kind: "function", startLine: 7, endLine: 9, signature: "func _ready() -> void" },
        ],
      }), "");
    });
    vi.doMock("node:child_process", () => ({ execFile }));

    const root = tempRoot("gdscript-mapper");
    cleanup.push(root);
    await mkdir(root, { recursive: true });
    const filePath = join(root, "Player.gd");
    await writeFile(filePath, "class_name Player\nsignal health_changed\nconst MAX_SPEED = 100\nvar velocity\n\nfunc _ready() -> void:\n\tpass\n");

    const { gdscriptMapper, MAPPER_VERSION } = await import("../src/readmap/mappers/gdscript.js");
    const map = await gdscriptMapper(filePath);

    expect(MAPPER_VERSION).toBeGreaterThanOrEqual(1);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile.mock.calls[0][0]).toBe("python3");
    expect(execFile.mock.calls[0][1]).toEqual([expect.stringContaining("gdscript_outline.py"), filePath]);
    expect(map).toMatchObject({
      path: filePath,
      totalLines: 8,
      language: "GDScript",
      imports: ["res://enemy.gd"],
    });
    expect(map?.symbols.map((symbol) => [symbol.name, symbol.kind, symbol.startLine, symbol.endLine, symbol.signature])).toEqual([
      ["Player", SymbolKind.Class, 1, 9, undefined],
      ["health_changed", SymbolKind.Signal, 3, 3, undefined],
      ["MAX_SPEED", SymbolKind.Constant, 4, 4, undefined],
      ["velocity", SymbolKind.Variable, 5, 5, undefined],
      ["_ready", SymbolKind.Function, 7, 9, "func _ready() -> void"],
    ]);
  });


  it("returns null when helper stdout is not JSON", async () => {
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => callback(null, "not json", ""));
    vi.doMock("node:child_process", () => ({ execFile }));
    const root = tempRoot("gdscript-json-failure");
    cleanup.push(root);
    await mkdir(root, { recursive: true });
    const filePath = join(root, "Player.gd");
    await writeFile(filePath, "func _ready():\n\tpass\n");

    const { gdscriptMapper } = await import("../src/readmap/mappers/gdscript.js");
    await expect(gdscriptMapper(filePath)).resolves.toBeNull();
  });
});
