import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { ensureHashInit } from "../src/hashline.js";
import { __resetHashlineSettingsPathsForTest, __setHashlineSettingsPathsForTest } from "../src/hashline-settings.js";
import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";

function tempRoot(prefix: string): string { return join(tmpdir(), `${prefix}-${randomBytes(6).toString("hex")}`); }
function text(result: any): string { return result.content?.find((entry: any) => entry.type === "text")?.text ?? ""; }
async function readTool(params: { path: string; map?: boolean; symbol?: string }) {
  let capturedTool: any = null;
  const { registerReadTool } = await import("../src/read.js");
  registerReadTool({ registerTool(def: any) { capturedTool = def; } } as any);
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("GDScript read workflows", () => {
  const cleanup: string[] = [];
  beforeAll(async () => { await ensureHashInit(); });
  afterEach(async () => {
    __resetHashlineSettingsPathsForTest();
    vi.restoreAllMocks();
    vi.resetModules();
    await Promise.all(cleanup.map((path) => rm(path, { recursive: true, force: true })));
    cleanup.length = 0;
  });

  it("renders maps and reads GDScript symbols through the registered mapper", async () => {
    const root = tempRoot("gdscript-read-map");
    cleanup.push(root);
    await mkdir(root, { recursive: true });
    const filePath = join(root, "Player.gd");
    await writeFile(filePath, [
      "class_name Player",
      "signal health_changed(new_value: int)",
      "func _ready() -> void:",
      "\tpass",
      "func take_damage(amount: int) -> void:",
      "\tpass",
      "",
    ].join("\n"));
    const projectSettingsPath = join(root, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(projectSettingsPath, ".."), { recursive: true });
    await writeFile(projectSettingsPath, JSON.stringify({ gdscript: { enabled: true } }));
    __setHashlineSettingsPathsForTest({ globalSettingsPath: join(root, "missing.json"), projectSettingsPath });
    const gdscriptMapper = vi.fn(async (path: string) => ({
      path,
      totalLines: 7,
      totalBytes: 132,
      language: "GDScript",
      imports: ["res://weapons/sword.gd"],
      symbols: [
        { name: "Player", kind: SymbolKind.Class, startLine: 1, endLine: 6 },
        { name: "health_changed", kind: SymbolKind.Signal, startLine: 2, endLine: 2 },
        { name: "_ready", kind: SymbolKind.Function, startLine: 3, endLine: 4, signature: "func _ready() -> void:" },
        { name: "take_damage", kind: SymbolKind.Function, startLine: 5, endLine: 6, signature: "func take_damage(amount: int) -> void:" },
      ],
      detailLevel: DetailLevel.Full,
    }));
    vi.doMock("../src/readmap/mappers/gdscript.js", () => ({ MAPPER_VERSION: 1, gdscriptMapper }));
    const { clearMapCache } = await import("../src/map-cache.js");

    const mapResult = await readTool({ path: filePath, map: true });
    const mapOutput = text(mapResult);
    expect(gdscriptMapper).toHaveBeenCalledTimes(1);
    expect(mapResult.isError).not.toBe(true);
    expect(mapOutput).toContain("File Map: Player.gd");
    expect(mapOutput).toContain("GDScript");
    expect(mapOutput).toContain("imports: res://weapons/sword.gd");
    expect(mapOutput).toContain("func take_damage(amount: int) -> void:");

    clearMapCache();
    const signalResult = await readTool({ path: filePath, symbol: "health_changed" });
    expect(text(signalResult)).toMatch(/^\[Symbol: health_changed \(signal\), lines 2-2 of 7\]/);
    expect(text(signalResult)).toContain("signal health_changed(new_value: int)");

    clearMapCache();
    const functionResult = await readTool({ path: filePath, symbol: "take_damage" });
    expect(text(functionResult)).toMatch(/^\[Symbol: take_damage \(function\), lines 5-6 of 7\]/);
    expect(text(functionResult)).toContain("func take_damage(amount: int) -> void:");

    vi.resetModules();
    const fallbackRoot = tempRoot("gdscript-read-unavailable");
    cleanup.push(fallbackRoot);
    await mkdir(fallbackRoot, { recursive: true });
    const fallbackPath = join(fallbackRoot, "Player.gd");
    await writeFile(fallbackPath, "func _ready():\n\tpass\n");
    const fallbackSettingsPath = join(fallbackRoot, "repo/.pi/hashline-readmap/settings.json");
    await mkdir(join(fallbackSettingsPath, ".."), { recursive: true });
    await writeFile(fallbackSettingsPath, JSON.stringify({ gdscript: { enabled: true } }));
    const { __setHashlineSettingsPathsForTest: setFallbackSettingsPathsForTest } = await import("../src/hashline-settings.js");
    setFallbackSettingsPathsForTest({ globalSettingsPath: join(fallbackRoot, "missing.json"), projectSettingsPath: fallbackSettingsPath });
    const nullMapper = vi.fn(async () => null);
    vi.doMock("../src/readmap/mappers/gdscript.js", () => ({ MAPPER_VERSION: 1, gdscriptMapper: nullMapper }));

    const fallbackResult = await readTool({ path: fallbackPath, map: true });
    expect(nullMapper).toHaveBeenCalledTimes(1);
    expect(fallbackResult.isError).not.toBe(true);
    expect(text(fallbackResult)).toContain("File Map: Player.gd");
  });
});
