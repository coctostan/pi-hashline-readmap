import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerReadTool } from "../src/read.js";
import { buildReadSourceOutput } from "../src/read-output.js";
import { buildPtcLines, renderPtcLines } from "../src/ptc-value.js";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";
import {
  __setHashlineSettingsPathsForTest,
  __resetHashlineSettingsPathsForTest,
  resolveHashlineJsonSettings,
} from "../src/hashline-settings.js";

let dir: string;
let globalPath: string;
let projectPath: string;
const register = () => registerReadTool({ registerTool() {} } as unknown as ExtensionAPI);
const call = (tool: ReturnType<typeof register>, params: Record<string, unknown>) =>
  tool.execute("test", params, undefined, undefined, { cwd: dir } as Parameters<typeof tool.execute>[4]);
const text = (result: Awaited<ReturnType<typeof call>>) =>
  result.content.filter((item) => item.type === "text").map((item) => item.text).join("\n");
const enable = () => writeFileSync(globalPath, JSON.stringify({ read: { allowUnclipped: true } }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "read-unclipped-"));
  globalPath = join(dir, "global.json");
  projectPath = join(dir, "project.json");
  __setHashlineSettingsPathsForTest({ globalSettingsPath: globalPath, projectSettingsPath: projectPath });
  clearMapCache();
});
afterEach(() => {
  __resetHashlineSettingsPathsForTest();
  clearMapCache();
  rmSync(dir, { recursive: true, force: true });
});

describe("read.allowUnclipped settings", () => {
  it("defaults off and allows project false to override global true", () => {
    expect(resolveHashlineJsonSettings()).toEqual({ settings: {}, warnings: [] });
    enable();
    expect(resolveHashlineJsonSettings().settings.read).toEqual({ allowUnclipped: true });
    writeFileSync(projectPath, '{"read":{"allowUnclipped":false}}');
    expect(resolveHashlineJsonSettings().settings.read).toEqual({ allowUnclipped: false });
  });

  it.each(["true", 1, null, [], {}])("ignores invalid field %j without erasing global settings", (value) => {
    enable();
    writeFileSync(projectPath, JSON.stringify({ read: { allowUnclipped: value }, display: { previewLines: 2 } }));
    const result = resolveHashlineJsonSettings();
    expect(result.settings).toEqual({ read: { allowUnclipped: true }, display: { previewLines: 2 } });
    expect(result.warnings).toEqual([expect.objectContaining({ source: projectPath, path: "read.allowUnclipped" })]);
  });
});

describe("unclipped read registration and execution", () => {
  it("preserves default schema identity and metadata when disabled", () => {
    const omitted = register();
    writeFileSync(globalPath, '{"read":{"allowUnclipped":false}}');
    const disabled = register();
    expect(disabled.parameters).toBe(omitted.parameters);
    expect(Object.keys(disabled.parameters.properties)).toEqual(["path", "offset", "limit", "symbol", "map", "bundle"]);
    expect(disabled.promptGuidelines).toBe(omitted.promptGuidelines);
    expect(JSON.stringify([disabled.parameters, disabled.promptGuidelines, disabled.description, disabled.promptSnippet])).not.toContain("unclipped");
    enable();
    const enabled = register();
    expect(enabled.parameters.required).toEqual(["path"]);
    expect(enabled.parameters.properties).toEqual({
      ...disabled.parameters.properties,
      unclipped: expect.objectContaining({ type: "boolean" }),
    });
    expect(enabled.description).toBe(disabled.description);
    expect(enabled.promptSnippet).toBe(disabled.promptSnippet);
    expect(enabled.promptGuidelines.slice(0, -1)).toEqual(disabled.promptGuidelines);
    expect(enabled.promptGuidelines.at(-1)).toContain("unclipped: true");
  });

  it.each([true, false, "true", null])("rejects direct unclipped=%j calls when disabled, even after settings change", async (unclipped) => {
    const tool = register();
    enable();
    const result = await call(tool, { path: "missing.txt", unclipped });
    expect(result).toMatchObject({ isError: true, details: { ptcValue: { error: { code: "invalid-unclipped" } } } });
    expect(text(result)).toContain("read.allowUnclipped: true");
  });

  it.each(["true", 1, {}, []])("rejects invalid enabled parameter %j", async (unclipped) => {
    enable();
    expect(await call(register(), { path: "missing.txt", unclipped })).toMatchObject({
      isError: true, details: { ptcValue: { error: { code: "invalid-unclipped" } } },
    });
  });

  it.each([
    { rows: Array.from({ length: 2105 }, (_, i) => `row ${i}`) },
    { rows: Array.from({ length: 300 }, (_, i) => `${i} ${"x".repeat(400)}`) },
    { rows: ["é".repeat(60000) + "\tEND\u001b"] },
  ])("returns the complete selection beyond each output cap", async ({ rows }) => {
    enable();
    const path = join(dir, "large.txt");
    writeFileSync(path, ["before", ...rows, "after"].join("\n"));
    const tool = register();
    const params = { path, offset: 2, limit: rows.length };
    const result = await call(tool, { ...params, unclipped: true });
    const expectedRows = rows.map((raw, index) => `${index + 2}:${computeLineHash(index + 2, raw)}|${escapeControlCharsForDisplay(raw)}`);
    expect(text(result).split("\n").slice(0, rows.length)).toEqual(expectedRows);
    expect(text(result)).not.toContain("[truncated");
    expect(result.details).toMatchObject({
      ptcValue: { unclipped: true, truncation: null, range: { startLine: 2, endLine: rows.length + 1 }, continuation: { nextOffset: rows.length + 2 } },
      contextHygiene: { rehydrate: { tool: "read", input: { ...params, unclipped: true } } },
    });
    const normal = await call(tool, params);
    expect(await call(tool, { ...params, unclipped: false })).toEqual(normal);
    expect(text(normal)).toContain("truncated");
    expect(normal.details?.ptcValue).not.toHaveProperty("unclipped");
    expect(renderPtcLines(buildPtcLines(2, rows))).toContain(rows[0].length > 500 ? "[truncated" : "2:");
    const source = buildReadSourceOutput({ startLine: 2, totalLines: rows.length + 2, selectedLines: rows, unclipped: true });
    expect(source.budget).toMatchObject({ truncated: false, outputLines: rows.length, outputBytes: Buffer.byteLength(expectedRows.join("\n")) });
  });

  it("returns full files and offsets without a limit", async () => {
    enable();
    const rows = Array.from({ length: 2101 }, (_, i) => `line ${i}`);
    const path = join(dir, "whole.txt");
    writeFileSync(path, rows.join("\n"));
    const tool = register();
    for (const offset of [undefined, 2]) {
      const result = await call(tool, { path, offset, unclipped: true });
      expect(text(result).split("\n")).toHaveLength(rows.length - ((offset ?? 1) - 1));
      expect(text(result)).toContain("|line 2100");
      expect(result.details?.ptcValue).toMatchObject({ truncation: null, continuation: null, map: { appended: false } });
    }
  });

  it("keeps symbol selections, limit, maps, and bundled support with full long lines", async () => {
    enable();
    const supportLine = `  return "${"s".repeat(1200)}";`;
    const targetLine = `  const value = "${"t".repeat(1200)}";`;
    const rows = ["function helper() {", supportLine, "}", "export function target() {", targetLine,
      ...Array.from({ length: 2100 }, () => "  // body"), "  return helper();", "}", "const outside = 1;"];
    const path = join(dir, "symbols.ts");
    writeFileSync(path, rows.join("\n"));
    const tool = register();
    const result = await call(tool, { path, symbol: "target", bundle: "local", map: true, unclipped: true });
    expect(text(result)).toContain(`|${supportLine}`);
    expect(text(result)).toContain(`|${targetLine}`);
    expect(text(result)).toContain("|  return helper();");
    expect(text(result)).not.toContain("|const outside");
    expect(text(result)).not.toContain("truncated");
    expect(result.details?.ptcValue).toMatchObject({ truncation: null, map: { requested: true, appended: true }, bundle: { applied: true, localSupport: [{ name: "helper" }] } });
    const limited = await call(tool, { path, symbol: "target", limit: 2, bundle: "local", map: true, unclipped: true });
    expect(limited.details?.ptcValue).toMatchObject({ range: { startLine: 4, endLine: 5 }, continuation: { nextOffset: 6 }, truncation: null });
    expect(text(limited)).toContain(`|${supportLine}`);
    expect(text(limited)).toContain(`|${targetLine}`);
    expect(text(limited)).not.toContain("|  return helper();");
    expect(text(limited)).toContain(`Continue with read({ path: ${JSON.stringify(path)}, offset: 6, limit: 2, unclipped: true }).`);
    const clipped = await call(tool, { path, symbol: "target", limit: 2 });
    expect(text(clipped)).toContain(`Continue with read({ path: ${JSON.stringify(path)}, offset: 6, limit: 2 }).`);
  });
});
