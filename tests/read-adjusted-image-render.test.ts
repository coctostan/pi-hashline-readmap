import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";

const delegated = vi.hoisted(() => {
  const sentinel = { source: "builtin-read" };
  const result = {
    content: [
      { type: "text", text: "Read image file [image/png]" },
      { type: "image", data: "mock-image", mimeType: "image/png" },
    ],
    details: { delegated: true, sentinel },
  };
  return { sentinel, result, execute: vi.fn(async () => result) };
});

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-coding-agent")>();
  return { ...actual, createReadTool: () => ({ execute: delegated.execute }) };
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lBBkGQAAAABJRU5ErkJggg==",
  "base64",
);
const theme = { fg: (_: string, text: string) => text, bold: (text: string) => text };

async function tool(): Promise<any> {
  const { registerReadTool } = await import("../src/read.js");
  let captured: any;
  registerReadTool({ registerTool(def: any) { captured = def; } } as any);
  return captured;
}

function resultText(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

function renderedText(component: any, width = 80): string {
  return component?.text ?? component?.render?.(width)?.join("\n") ?? "";
}

describe("adjusted delegated image rendering", () => {
  beforeEach(() => delegated.execute.mockClear());

  it.each([
    ["extension", "image.png", 0],
    ["signature", "image", "0"],
  ] as const)("renders the adjusted %s-delegated result", async (_kind, fileName, offset) => {
    const directory = mkdtempSync(resolve(tmpdir(), "read-adjusted-image-"));
    try {
      const path = resolve(directory, fileName);
      writeFileSync(path, png);
      const readTool = await tool();
      const result = await readTool.execute(
        "read-adjusted-image",
        { path, offset, limit: "" },
        new AbortController().signal,
        () => {},
        { cwd: process.cwd() },
      );

      expect(result.isError).not.toBe(true);
      expect(resultText(result)).toBe(
        "[Read params adjusted: ignored empty limit; ignored offset 0]\n\n" +
        "Read image file [image/png]",
      );
      expect(result.content.find((item: any) => item.type === "image")).toBe(
        delegated.result.content[1],
      );
      expect(result.details.delegated).toBe(true);
      expect(result.details.sentinel).toBe(delegated.sentinel);
      expect(result.details.ptcValue.warnings).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
      );
      expect(renderedText(readTool.renderResult(result, {}, theme, {}))).toBe(
        "↳ loaded 2 lines • Ctrl+O to expand",
      );
      const expanded = renderedText(
        readTool.renderResult(
          result,
          { expanded: true, width: 40 },
          theme,
          { expanded: true, width: 40 },
        ),
        40,
      );
      expect(expanded).toContain("Read params adjusted:");
      expect(expanded).toContain("ignored offset 0");
      expect(expanded).toContain("Read image file [image/png]");
      expect(expanded.split("\n").every((line: string) => visibleWidth(line) <= 40)).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
