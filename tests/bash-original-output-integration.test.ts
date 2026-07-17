import { describe, it, expect } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function loadHandlers(tag: string) {
  const modUrl = pathToFileURL(resolve(root, "index.ts")).href + `?t=${tag}-${Date.now()}`;
  const handlers: Record<string, Function> = {};
  const mockPi = {
    registerTool() {},
    on(event: string, handler: Function) { handlers[event] = handler; },
    events: { emit() {}, on() {} },
  };
  const mod = await import(modUrl);
  mod.default(mockPi as any);
  return handlers;
}

describe("bash original output integration", () => {
  it("restores and ANSI-strips readable full-output contents while preserving existing details", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-full-"));
    const fullPath = join(dir, "output.txt");
    writeFileSync(fullPath, "\x1b[32mFULL output\x1b[0m\n", "utf8");

    try {
      const handlers = await loadHandlers("restored-full");
      const result = await handlers.tool_result({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-full-1",
        input: { command: "echo output" },
        content: [{ type: "text", text: `VISIBLE TAIL\n[Showing lines 10-20 of 20. Full output: ${fullPath}]` }],
        details: { fullOutputPath: fullPath, existing: "keep" },
        isError: false,
      });

      expect(result.content[0].text).toBe("FULL output\n");
      expect(result.details.existing).toBe("keep");
      expect(result.details.contextHygiene.classification).toBe("command-output");
      expect(result.details.bashOriginalOutput).toMatchObject({
        source: "pi-full-output-path",
        restoredContentForRtk: true,
        originalPath: fullPath,
      });
      expect(result.details).not.toHaveProperty("compressionInfo");
      expect(result.details).not.toHaveProperty("rtkCompaction");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("joins multiple text chunks and preserves non-text chunks for ordinary output", async () => {
    const handlers = await loadHandlers("chunks");
    const nonText = { type: "image", data: "opaque-test-data" };
    const result = await handlers.tool_result({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-chunks-1",
      input: { command: "echo hello" },
      content: [
        { type: "text", text: "hello" },
        nonText,
        { type: "text", text: "world" },
      ],
      details: { existing: "keep" },
      isError: false,
    });

    expect(result.content[0]).toEqual({ type: "text", text: "hello\nworld" });
    expect(result.content.slice(1)).toEqual([nonText]);
    expect(result.details.existing).toBe("keep");
    expect(result.details.bashOriginalOutput).toMatchObject({
      source: "pi-visible",
      restoredContentForRtk: false,
      snapshotNeeded: false,
    });
  });
});
