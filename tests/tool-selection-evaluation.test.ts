import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import cases from "./fixtures/tool-selection-evaluation.json";
import { collectHashlineSystemPromptMetadata } from "./helpers/pi-prompt-metadata-harness.js";
const NAMES = ["read", "edit", "grep", "find", "ls", "write", "ast_search", "nu"];
const capture = (fn: (pi: any) => any) => fn({ registerTool() {} });
const execute = (tool: any, input: Record<string, unknown>, cwd: string) => tool.execute("eval", input, new AbortController().signal, undefined, { cwd });
function at(root: any, path: string) { return path.startsWith("parameterDescriptions.") ? root.parameterDescriptions[path.slice(22)] : path.split(".").reduce((v, k) => v?.[k], root); }

describe("checked-in tool-selection evaluation table", () => {
  afterEach(() => { vi.doUnmock("node:child_process"); vi.resetModules(); });
  it("matches assembled metadata and current runtime behavior", async () => {
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<any>("node:child_process");
      return {
        ...actual,
        execFileSync: vi.fn(() => Buffer.from("0.111.0\n")),
        execFile: vi.fn((command: any, args: any, options: any, callback: any) =>
          Array.isArray(args) && args[0] === "run"
            ? callback(null, "[]", "")
            : actual.execFile(command, args, options, callback)),
      };
    });
    const { toolMetadata } = await collectHashlineSystemPromptMetadata(NAMES);
    const [{ registerReadTool }, { registerGrepTool }, { registerLsTool }, { registerFindTool, _testable }, { registerSgTool }] = await Promise.all([import("../src/read.js"), import("../src/grep.js"), import("../src/ls.js"), import("../src/find.js"), import("../src/sg.js")]);
    const tools = { read: capture(registerReadTool), grep: capture(registerGrepTool), ls: capture(registerLsTool), find: capture(registerFindTool), ast_search: capture(registerSgTool) } as const;
    _testable.isFdAvailable = () => false;
    const cwd = mkdtempSync(join(tmpdir(), "hashline-selection-eval-")); const grepDir = join(cwd, "grep"); const findDir = join(cwd, "find"); mkdirSync(grepDir); mkdirSync(findDir);
    writeFileSync(join(grepDir, "one.ts"), "function box() {\n  return 'needle';\n}\n"); writeFileSync(join(grepDir, "two.ts"), "export const needle = 2;\n"); writeFileSync(join(findDir, "recent.bin"), Buffer.alloc(1024, 1));
    const materialize = (input: Record<string, unknown>) => Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === "$SMALL_TS" ? join(process.cwd(), "tests/fixtures/small.ts") : v === "$GREP_DIR" ? grepDir : v === "$FIND_DIR" ? findDir : v]));
    for (const row of cases) {
      const metadata = toolMetadata[row.tool]; expect(metadata, row.id).toBeDefined();
      for (const check of row.metadata) expect(String(at(metadata, check.path)), `${row.id}:${check.path}`).toContain(check.includes);
      const tool = tools[row.tool as keyof typeof tools]; expect(tool, `${row.id} runtime tool`).toBeDefined();
      const result = await execute(tool, materialize(row.input), cwd); expect(result.isError === true, row.id).toBe(row.expectError);
      if (row.errorCode) expect(result.details?.ptcValue?.error?.code).toBe(row.errorCode);
      if (row.id === "grep-counts") { expect(result.content[0].text).toContain("[2 matches in 2 files]"); expect(result.content[0].text).not.toMatch(/\d+:[0-9a-f]{3}\|/); }
      if (row.id === "grep-anchors") expect(result.content[0].text).toMatch(/:>>\d+:[0-9a-f]{3}\|/);
      if (row.id === "grep-symbol-context") { expect(result.content[0].text).toContain("scoped to ±0 lines"); expect(result.details.ptcValue.scopes.mode).toBe("symbol"); }
      if (row.id === "find-date-size") expect(result.details.ptcValue.entries).toEqual([{ path: "recent.bin", type: "file" }]);
    }
  }, 20_000);
});
