import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensureHashInit } from "../src/hashline.js";
import { registerReadTool } from "../src/read.js";

const tempDirs: string[] = [];

function makeLine(index: number): string {
  const prefix = `export const value${String(index).padStart(3, "0")} = "`;
  const suffix = `";`;
  return `${prefix}${"x".repeat(800 - prefix.length - suffix.length)}${suffix}`;
}

function getText(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

async function callRead(path: string) {
  let readTool: any;
  registerReadTool({ registerTool(tool: any) { readTool = tool; } } as any);
  const result = await readTool.execute(
    "repro-232",
    { path },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );
  return { readTool, result };
}

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

describe("issue 232 — exact single-pass regression", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("projects the displayed 200×800 source budget consistently", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-issue-232-exact-"));
    tempDirs.push(dir);
    const filePath = resolve(dir, "long-lines.ts");
    const sourceLines = Array.from({ length: 200 }, (_, index) => makeLine(index + 1));
    writeFileSync(filePath, sourceLines.join("\n"), "utf-8");

    const { readTool, result } = await callRead(filePath);
    const text = getText(result);
    const emittedRows = text.match(/^\d+:[0-9a-f]{3}\|/gm)?.length ?? 0;
    const footer = text.match(
      /\[Output truncated: showing (\d+) of 200 lines .*Use offset=(\d+) to continue\.\]/,
    );

    expect({
      emittedRows,
      footerOutputLines: footer ? Number(footer[1]) : null,
      footerNextOffset: footer ? Number(footer[2]) : null,
      detailsOutputLines: result.details?.truncation?.outputLines ?? null,
      ptcOutputLines: result.details?.ptcValue?.truncation?.outputLines ?? null,
      map: result.details?.ptcValue?.map,
    }).toEqual({
      emittedRows: 94,
      footerOutputLines: 94,
      footerNextOffset: 95,
      detailsOutputLines: 94,
      ptcOutputLines: 94,
      map: { requested: false, appended: true },
    });

    expect(result.details.truncation).toMatchObject({
      truncated: true,
      truncatedBy: "bytes",
      outputLines: 94,
      totalLines: 200,
      outputBytes: 50_750,
      totalBytes: 108_091,
      maxLines: 2_000,
      maxBytes: 50 * 1024,
    });
    expect(result.details.ptcValue.truncation).toEqual({
      outputLines: 94,
      totalLines: 200,
      outputBytes: 50_750,
      totalBytes: 108_091,
    });
    expect(text).toContain("... [truncated, 800 chars total]");
    expect(result.details.ptcValue.lines).toHaveLength(200);
    expect(result.details.ptcValue.lines[0].raw).toBe(sourceLines[0]);
    expect(result.details.ptcValue.lines[0].display).toBe(sourceLines[0]);

    const rendered = readTool.renderResult(result, {}, theme, {});
    const tuiText = rendered?.text ?? rendered?.render?.(80)?.join("\n") ?? "";
    expect(tuiText).toContain("loaded 94 of 200 lines (truncated)");
  });
});
