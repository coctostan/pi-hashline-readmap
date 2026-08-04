import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { aggregateLinterOutput } from "../src/rtk/linter.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cleanup: string[] = [];

const strippedWarnings = [
  "[warn] src/foo.ts",
  "[warn] Code style issues found in the above file. Run Prettier with --write to fix.",
].join("\n");
const ansiWarnings = strippedWarnings.replace("[warn]", "\x1b[33m[warn]\x1b[0m");

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

async function loadToolResultHandler() {
  const handlers: Record<string, Function> = {};
  const mockPi = {
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  };
  const url = `${pathToFileURL(resolve(root, "index.ts")).href}?issue-231-linter=${Date.now()}`;
  const mod = await import(url);
  mod.default(mockPi as any);
  return handlers.tool_result;
}

function writeFullOutput(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hashline-231-linter-"));
  cleanup.push(dir);
  const path = join(dir, "full-output.txt");
  writeFileSync(path, text, "utf8");
  return path;
}

function bashEvent(id: string, command: string, fullOutputPath: string, isError: boolean) {
  return {
    type: "tool_result" as const,
    toolName: "bash",
    toolCallId: id,
    input: { command },
    content: [{ type: "text" as const, text: "pi-visible tail" }],
    isError,
    details: { fullOutputPath },
  };
}

describe("issue #231: lossless linter reduction", () => {
  it("preserves the ANSI-stripped Prettier reproduction with fallback metadata", async () => {
    const handleToolResult = await loadToolResultHandler();
    const warningPath = writeFullOutput(ansiWarnings);
    const result = await handleToolResult(
      bashEvent("linter-prettier", "prettier --check .", warningPath, false),
    );

    expect(result.content[0].text).toBe(strippedWarnings);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction).toMatchObject({
      applied: false,
      techniques: [],
      truncated: false,
    });
    expect(result.details.ptcValue.rtkCompaction).toEqual(result.details.rtkCompaction);
    expect(result.details.bashOriginalOutput).toMatchObject({
      source: "pi-full-output-path",
      restoredContentForRtk: true,
      originalPath: warningPath,
    });
  });

  it.each([
    ["eslint src/", ["/tmp/src/foo.ts", "  10:5  warning  Unexpected any  no-explicit-any"].join("\n")],
    ["eslint .", "Error: Cannot find module 'eslint-plugin-x'"],
  ])("preserves unsupported non-empty linter output for %s", async (command, output) => {
    const handleToolResult = await loadToolResultHandler();
    const result = await handleToolResult(
      bashEvent(`unsupported-${command}`, command, writeFullOutput(output), false),
    );

    expect(result.content[0].text).toBe(output);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction.applied).toBe(false);
  });

  it("keeps isError as an unconditional ANSI-stripped fallback", async () => {
    const handleToolResult = await loadToolResultHandler();
    const result = await handleToolResult(
      bashEvent("linter-failed", "prettier --check .", writeFullOutput(ansiWarnings), true),
    );

    expect(result.content[0].text).toBe(strippedWarnings);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction.applied).toBe(false);
  });

  it("still aggregates recognized linter issues", async () => {
    const handleToolResult = await loadToolResultHandler();
    const result = await handleToolResult(
      bashEvent(
        "linter-recognized",
        "eslint src/",
        writeFullOutput("src/foo.ts:1:1: Missing semicolon [semi]\n"),
        false,
      ),
    );

    expect(result.content[0].text).toContain("ESLint: 1 errors, 0 warnings in 1 files");
    expect(result.details.compressionInfo.technique).toBe("linter");
    expect(result.details.rtkCompaction).toMatchObject({
      applied: true,
      techniques: ["linter"],
      truncated: false,
    });
    expect(result.details.ptcValue.rtkCompaction).toEqual(result.details.rtkCompaction);
  });

  it("retains direct empty and whitespace-only clean evidence", () => {
    expect(aggregateLinterOutput("", "eslint src/")).toBe("✓ ESLint: No issues found");
    expect(aggregateLinterOutput(" \n\t", "eslint src/")).toBe("✓ ESLint: No issues found");
  });
});
