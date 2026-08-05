import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureHashInit } from "../src/hashline.js";
import { clearMapCache } from "../src/map-cache.js";
import { registerReadTool } from "../src/read.js";

const tempDirs: string[] = [];

function makeLine(index: number): string {
  const prefix = `export const hugeValue${index} = "`;
  const suffix = `";`;
  return `${prefix}${"x".repeat(20_000 - prefix.length - suffix.length)}${suffix}`;
}

async function callRead(path: string) {
  let readTool: any;
  registerReadTool({ registerTool(tool: any) { readTool = tool; } } as any);
  return readTool.execute(
    "repro-232-map",
    { path },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

describe("issue 232 — automatic map eligibility uses displayed truncation", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearMapCache();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not auto-append a map when every capped source row fits", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-232-map-"));
    tempDirs.push(dir);
    const filePath = resolve(dir, "all-capped-rows-fit.ts");
    writeFileSync(filePath, Array.from({ length: 4 }, (_, index) => makeLine(index + 1)).join("\n"), "utf-8");

    const mapModule = await import("../src/map-cache.js");
    const mapSpy = vi.spyOn(mapModule, "getOrGenerateMap");
    const result = await callRead(filePath);
    const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
    const emittedRows = text.match(/^\d+:[0-9a-f]{3}\|/gm)?.length ?? 0;

    expect(result.details.ptcValue.map).toEqual({ requested: false, appended: false });
    expect({
      emittedRows,
      hasTruncationFooter: text.includes("[Output truncated:"),
      detailsTruncation: result.details.truncation ?? null,
      ptcTruncation: result.details.ptcValue.truncation,
      hasFileMap: text.includes("File Map:"),
      mapCalls: mapSpy.mock.calls.length,
    }).toEqual({
      emittedRows: 4,
      hasTruncationFooter: false,
      detailsTruncation: null,
      ptcTruncation: null,
      hasFileMap: false,
      mapCalls: 0,
    });
  });
});
