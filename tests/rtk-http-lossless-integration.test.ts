import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cleanup: string[] = [];

const numericBody = Array.from({ length: 10 }, () => "0 1 2 3 4 5").join("\n");
const ansiNumericBody = numericBody.replace(
  "0 1 2 3 4 5",
  "\x1b[34m0 1 2 3 4 5\x1b[0m",
);
const progressRow = "100  1234  100  1234    0     0   5678      0 --:--:-- --:--:-- --:--:--  5678";

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
  const url = `${pathToFileURL(resolve(root, "index.ts")).href}?issue-231-http=${Date.now()}`;
  const mod = await import(url);
  mod.default(mockPi as any);
  return handlers.tool_result;
}

function writeFullOutput(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), "hashline-231-http-"));
  cleanup.push(dir);
  const path = join(dir, "full-output.txt");
  writeFileSync(path, text, "utf8");
  return path;
}

function bashEvent(id: string, fullOutputPath: string, isError: boolean) {
  return {
    type: "tool_result" as const,
    toolName: "bash",
    toolCallId: id,
    input: { command: "curl -s http://x/data.txt" },
    content: [{ type: "text" as const, text: "pi-visible HTTP tail" }],
    isError,
    details: { fullOutputPath },
  };
}

describe("issue #231: lossless HTTP reduction", () => {
  it("preserves the ten-line numeric reproduction with fallback metadata", async () => {
    const handleToolResult = await loadToolResultHandler();
    const numericPath = writeFullOutput(ansiNumericBody);
    const result = await handleToolResult(bashEvent("http-numeric", numericPath, false));

    expect(result.content[0].text).toBe(numericBody);
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
      originalPath: numericPath,
    });
  });

  it("declines an unsupported numeric body below the ten-line threshold", async () => {
    const handleToolResult = await loadToolResultHandler();
    const shortNumericBody = Array.from({ length: 9 }, () => "0 1 2 3 4 5").join("\n");
    const result = await handleToolResult(
      bashEvent("http-short-numeric", writeFullOutput(shortNumericBody), false),
    );

    expect(result.content[0].text).toBe(shortNumericBody);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction).toMatchObject({
      applied: false,
      techniques: [],
      truncated: false,
    });
  });

  it("declines when recognized progress removal would erase all content", async () => {
    const handleToolResult = await loadToolResultHandler();
    const progressOnly = Array.from({ length: 10 }, () => progressRow).join("\n");
    const result = await handleToolResult(
      bashEvent("http-progress-only", writeFullOutput(progressOnly), false),
    );

    expect(result.content[0].text).toBe(progressOnly);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction.applied).toBe(false);
  });

  it("still removes recognized curl progress while preserving headers and body", async () => {
    const handleToolResult = await loadToolResultHandler();
    const recognizedOutput = [
      "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current",
      "                                 Dload  Upload   Total   Spent    Left  Speed",
      "  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0",
      progressRow,
      "HTTP/1.1 200 OK",
      "Content-Type: application/json",
      "Content-Length: 29",
      "",
      "{\"status\":\"ok\"}",
      "{\"done\":true}",
    ].join("\n");
    const result = await handleToolResult(
      bashEvent("http-recognized", writeFullOutput(recognizedOutput), false),
    );

    expect(result.content[0].text).toContain("HTTP/1.1 200 OK");
    expect(result.content[0].text).toContain("{\"status\":\"ok\"}");
    expect(result.content[0].text).not.toContain("% Total");
    expect(result.content[0].text).not.toContain("Dload  Upload");
    expect(result.content[0].text).not.toContain(progressRow);
    expect(result.details.compressionInfo.technique).toBe("http-client");
    expect(result.details.rtkCompaction).toMatchObject({
      applied: true,
      techniques: ["http-client"],
      truncated: false,
    });
    expect(result.details.ptcValue.rtkCompaction).toEqual(result.details.rtkCompaction);
  });

  it("keeps isError as an unconditional ANSI-stripped fallback", async () => {
    const handleToolResult = await loadToolResultHandler();
    const result = await handleToolResult(
      bashEvent("http-failed", writeFullOutput(ansiNumericBody), true),
    );

    expect(result.content[0].text).toBe(numericBody);
    expect(result.details.compressionInfo.technique).toBe("none");
    expect(result.details.rtkCompaction.applied).toBe(false);
  });
});
