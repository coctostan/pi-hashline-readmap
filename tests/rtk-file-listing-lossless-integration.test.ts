import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cleanup: string[] = [];

const longRows = Array.from(
  { length: 120 },
  (_, index) => `-rw-r--r-- 1 pun pun 4096 Jul 26 12:00 file${index}.ts`,
);
const strippedListing = longRows.join("\n");
const ansiListing = [
  `\x1b[36m${longRows[0]}\x1b[0m`,
  ...longRows.slice(1),
].join("\n");

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
  const url = `${pathToFileURL(resolve(root, "index.ts")).href}?issue-231-listing=${Date.now()}`;
  const mod = await import(url);
  mod.default(mockPi as any);
  return handlers.tool_result;
}

function writeFullOutput(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hashline-231-listing-"));
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
    content: [{ type: "text" as const, text: "pi-visible listing tail" }],
    isError,
    details: { fullOutputPath },
  };
}

describe("issue #231: lossless file-listing reduction", () => {
  it("declines the 120-row long-format reproduction with public fallback metadata", async () => {
    const handleToolResult = await loadToolResultHandler();
    const listingPath = writeFullOutput(ansiListing);
    const result = await handleToolResult(
      bashEvent("listing-long", "ls -la", listingPath, false),
    );

    expect(result.content[0].text).toBe(strippedListing);
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
      originalPath: listingPath,
    });
  });

  it("declines total-only ls -l output before the short-output path", async () => {
    const handleToolResult = await loadToolResultHandler();
    const result = await handleToolResult(
      bashEvent("listing-total", "ls -l", writeFullOutput("total 0"), false),
    );

    expect(result.content[0].text).toBe("total 0");
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction).toMatchObject({
      applied: false,
      techniques: [],
      truncated: false,
    });
  });

  it("preserves a mixed unsupported row and ANSI diagnostic as a whole", async () => {
    const handleToolResult = await loadToolResultHandler();
    const mixedAnsi = [
      ...Array.from({ length: 119 }, (_, index) => `./src/file${index}.ts`),
      "-rw-r--r-- 1 pun pun 4096 Jul 26 12:00 generated.txt",
      "\x1b[31mls: cannot access './secret': Permission denied\x1b[0m",
    ].join("\n");
    const mixedStripped = mixedAnsi.replace(
      "\x1b[31mls: cannot access './secret': Permission denied\x1b[0m",
      "ls: cannot access './secret': Permission denied",
    );
    const result = await handleToolResult(
      bashEvent("listing-mixed", "ls -la", writeFullOutput(mixedAnsi), false),
    );

    expect(result.content[0].text).toBe(mixedStripped);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction.applied).toBe(false);
  });

  it("keeps isError as an unconditional ANSI-stripped fallback", async () => {
    const handleToolResult = await loadToolResultHandler();
    const result = await handleToolResult(
      bashEvent("listing-failed", "ls -la", writeFullOutput(ansiListing), true),
    );

    expect(result.content[0].text).toBe(strippedListing);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction.applied).toBe(false);
  });

  it("still compacts recognized large bare-path listings", async () => {
    const handleToolResult = await loadToolResultHandler();
    const barePaths = [
      ...Array.from({ length: 60 }, (_, index) => `./src/a/file${index}.ts`),
      ...Array.from({ length: 50 }, (_, index) => `./src/b/file${index}.ts`),
    ].join("\n");
    const result = await handleToolResult(
      bashEvent("listing-recognized", "find . -type f", writeFullOutput(barePaths), false),
    );

    expect(result.content[0].text).toContain("src/a/ (60 files)");
    expect(result.content[0].text).toContain("src/b/ (50 files)");
    expect(result.content[0].text).toContain("Total: 110 files in 2 directories");
    expect(result.details.compressionInfo.technique).toBe("file-listing");
    expect(result.details.rtkCompaction).toMatchObject({
      applied: true,
      techniques: ["file-listing"],
      truncated: false,
    });
    expect(result.details.ptcValue.rtkCompaction).toEqual(result.details.rtkCompaction);
  });
});
