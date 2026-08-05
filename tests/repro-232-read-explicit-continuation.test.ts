import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureHashInit } from "../src/hashline.js";
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
    "repro-232-explicit-continuation",
    { path, limit: 4 },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
}

describe("issue 232 — explicit continuation uses the prepared display result", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("continues at endIdx + 1 when every selected capped row fits", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-232-continuation-"));
    tempDirs.push(dir);
    const filePath = resolve(dir, "five-long-lines.ts");
    writeFileSync(
      filePath,
      Array.from({ length: 5 }, (_, index) => makeLine(index + 1)).join("\n"),
      "utf-8",
    );

    const result = await callRead(filePath);
    const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
    const emittedRows = text.match(/^\d+:[0-9a-f]{3}\|/gm)?.length ?? 0;
    const expectedFooter = "[Showing lines 1-4 of 5. Use offset=5 to continue.]";

    expect(text.includes(expectedFooter)).toBe(true);
    expect({
      emittedRows,
      detailsTruncation: result.details.truncation ?? null,
      ptcTruncation: result.details.ptcValue.truncation,
      map: result.details.ptcValue.map,
    }).toEqual({
      emittedRows: 4,
      detailsTruncation: null,
      ptcTruncation: null,
      map: { requested: false, appended: false },
    });
  });
});
