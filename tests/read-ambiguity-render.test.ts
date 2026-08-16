import { resolve } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";

const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };

async function tool(): Promise<any> {
  const { registerReadTool } = await import("../src/read.js");
  let captured: any;
  registerReadTool({ registerTool(def: any) { captured = def; } } as any);
  return captured;
}

function textOf(component: any, width = 80): string {
  return component?.text ?? component?.render?.(width)?.join("\n") ?? "";
}

afterEach(() => vi.restoreAllMocks());

describe("ambiguous read rendering", () => {
  it("keeps adjusted ambiguity guidance actionable when collapsed and expanded", async () => {
    const cache = await import("../src/map-cache.js");
    const { DetailLevel, SymbolKind } = await import("../src/readmap/enums.js");
    vi.spyOn(cache, "getOrGenerateMap").mockResolvedValue({
      path: resolve("tests/fixtures/small.ts"),
      totalLines: 49,
      totalBytes: 1000,
      language: "typescript",
      symbols: [
        { name: "process", kind: SymbolKind.Function, startLine: 1, endLine: 10 },
        { name: "process", kind: SymbolKind.Function, startLine: 20, endLine: 30 },
      ],
      imports: [],
      detailLevel: DetailLevel.Full,
    });

    const readTool = await tool();
    const result = await readTool.execute(
      "read-adjusted-ambiguity",
      { path: resolve("tests/fixtures/small.ts"), symbol: "process", limit: "" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).not.toBe(true);
    expect(result.details.ptcValue.ambiguity.query).toBe("process");
    expect(textOf(readTool.renderResult(result, {}, theme, {}))).toBe(
      "↳ Symbol 'process' is ambiguous. • Ctrl+O to expand",
    );

    const expanded = textOf(
      readTool.renderResult(
        result,
        { expanded: true, width: 40 },
        theme,
        { expanded: true, width: 40 },
      ),
      40,
    );
    expect(expanded).toContain("Read params adjusted:");
    expect(expanded).toContain("process (function) — lines 1-10");
    expect(expanded).toContain("process (function) — lines 20-30");
    expect(expanded).toContain("Use process@1 or process@20");
    expect(expanded).toContain("shown candidate.");
    expect(expanded.split("\n").every((line: string) => visibleWidth(line) <= 40)).toBe(true);
  });
});
