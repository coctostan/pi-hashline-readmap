import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import * as cp from "node:child_process";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { computeLineHash, escapeControlCharsForDisplay } from "../src/hashline.js";
import * as sgModule from "../src/sg.js";
import * as sgOutputModule from "../src/sg-output.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getSgTool() {
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  sgModule.registerSgTool(mockPi as any);
  if (!captured) throw new Error("sg tool was not registered");
  return captured;
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("buildSgOutput", () => {
  beforeAll(async () => {
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders grouped ast_search matches through one shared builder", async () => {
    const spy = vi.spyOn(sgOutputModule, "buildSgOutput");
    const tool = await getSgTool();
    const filePath = resolve(fixturesDir, "small.ts");
    const displayPath = relative(process.cwd(), filePath);
    const sourceLines = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n").split("\n");

    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, JSON.stringify([
        { file: filePath, range: { start: { line: 44, column: 0 }, end: { line: 44, column: 0 } } },
        { file: filePath, range: { start: { line: 45, column: 0 }, end: { line: 48, column: 0 } } },
      ]), "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "export function $NAME($$$PARAMS) { $$$BODY }", path: filePath },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    const built = spy.mock.results.at(-1)?.value;
    const expectedText = [
      `--- ${displayPath} ---`,
      ...[45, 46, 47, 48, 49].map((lineNumber) => {
        const raw = sourceLines[lineNumber - 1];
        const hash = computeLineHash(lineNumber, raw);
        return `>>${lineNumber}:${hash}|${escapeControlCharsForDisplay(raw)}`;
      }),
    ].join("\n");

    expect(built.text).toBe(expectedText);
    expect(built.ptcValue.tool).toBe("ast_search");
    expect(getTextContent(result)).toBe(built.text);
    expect(result.details?.ptcValue).toEqual(built.ptcValue);
  });

  it("projects no-match responses through the shared sg builder", async () => {
    expect(sgOutputModule.buildSgOutput({ pattern: "does-not-match", files: [] }).text).toBe(
      "No matches found for pattern: does-not-match",
    );

    const spy = vi.spyOn(sgOutputModule, "buildSgOutput");
    const tool = await getSgTool();
    vi.mocked(cp.execFile).mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, "[]", "");
      return {} as any;
    });

    const result = await tool.execute(
      "tc",
      { pattern: "does-not-match" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    const built = spy.mock.results.at(-1)?.value;
    expect(built.ptcValue.tool).toBe("ast_search");
    expect(getTextContent(result)).toBe(built.text);
    expect(result.details?.ptcValue).toEqual(built.ptcValue);
  });
});
