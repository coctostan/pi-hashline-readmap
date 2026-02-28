import { describe, it, expect, vi, afterEach } from "vitest";
import * as cp from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getSgTool() {
  const { registerSgTool } = await import("../src/sg.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function text(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

function parseAnchors(block: string): Array<{ line: number; hash: string; anchor: string; content: string }> {
  const out: Array<{ line: number; hash: string; anchor: string; content: string }> = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^>>(\d+):([0-9a-f]{2})\|(.*)$/);
    if (!m) continue;
    out.push({
      line: Number(m[1]),
      hash: m[2],
      anchor: `${m[1]}:${m[2]}`,
      content: m[3],
    });
  }
  return out;
}

describe("sg formatting", () => {
  afterEach(() => vi.restoreAllMocks());

  it("formats match lines with correct 1-indexed hashlines and anchors apply via hashline engine", async () => {
    const tool = await getSgTool();

    const absSmallTs = resolve(fixturesDir, "small.ts");

    // createDemoDirectory() spans lines 45-49 in tests/fixtures/small.ts
    const mockedMatches = [
      {
        file: absSmallTs,
        range: { start: { line: 44, column: 0 }, end: { line: 48, column: 0 } },
        text: "",
        lines: "",
      },
    ];

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify(mockedMatches), "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "export function $NAME($$$PARAMS) { $$$BODY }", path: absSmallTs },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(result.isError).toBeFalsy();

    const out = text(result);
    expect(out).toContain("---");

    const anchors = parseAnchors(out);
    expect(anchors.length).toBe(5);
    expect(anchors[0].line).toBe(45);
    expect(anchors[4].line).toBe(49);
    expect(anchors[0].content).toContain("export function createDemoDirectory");

    const { computeLineHash, applyHashlineEdits } = await import("../src/hashline.js");
    const fileLines = readFileSync(absSmallTs, "utf-8").split("\n");

    for (const a of anchors) {
      expect(a.hash).toBe(computeLineHash(a.line, fileLines[a.line - 1] ?? ""));
    }

    const original = readFileSync(absSmallTs, "utf-8");
    const edited = applyHashlineEdits(original, [
      { set_line: { anchor: anchors[0].anchor, new_text: "// sg-anchor-test" } },
    ]);

    expect(edited.firstChangedLine).toBe(45);
    expect(edited.content).toContain("// sg-anchor-test");
  });

  it("groups output by file with one header per file", async () => {
    const tool = await getSgTool();

    const absSmallTs = resolve(fixturesDir, "small.ts");
    const absPlain = resolve(fixturesDir, "plain.txt");

    const mockedMatches = [
      { file: absSmallTs, range: { start: { line: 44, column: 0 }, end: { line: 44, column: 0 } } },
      { file: absSmallTs, range: { start: { line: 45, column: 0 }, end: { line: 45, column: 0 } } },
      { file: absPlain, range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } } },
    ];

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify(mockedMatches), "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "p", path: fixturesDir },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    const out = text(result);
    const headers = out.split("\n").filter((l) => l.startsWith("--- "));
    expect(headers.length).toBe(2);
  });
});
