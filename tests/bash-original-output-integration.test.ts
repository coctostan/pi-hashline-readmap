import { describe, it, expect, vi } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as gitModule from "../src/rtk/git.js";

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
  it("passes readable full-output file contents to RTK and preserves existing details", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-full-"));
    const fullPath = join(dir, "output.txt");
    writeFileSync(fullPath, "FULL git output\n", "utf8");
    let seenByRtk = "";
    const spy = vi.spyOn(gitModule, "compactGitOutput").mockImplementation((output) => {
      seenByRtk = output;
      return "compressed full output";
    });

    try {
      const handlers = await loadHandlers("restored-full");
      const result = await handlers["tool_result"]({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-full-1",
        input: { command: "git diff" },
        content: [{ type: "text", text: "VISIBLE TAIL\n[Showing lines 10-20 of 20. Full output: " + fullPath + "]" }],
        details: { fullOutputPath: fullPath, existing: "keep" },
        isError: false,
      });

      expect(seenByRtk).toBe("FULL git output\n");
      expect(result.content[0].text).toMatch(/^\[RTK: compressed git output .*\]\ncompressed full output$/);
      expect(result.details.existing).toBe("keep");
      expect(result.details.compressionInfo.technique).toBe("git");
      expect(result.details.contextHygiene.classification).toBe("command-output");
      expect(result.details.bashOriginalOutput).toMatchObject({
        source: "pi-full-output-path",
        restoredContentForRtk: true,
        originalPath: fullPath,
      });
    } finally {
      spy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps source-selection metadata when PI_RTK_BYPASS skips compression", async () => {
    const handlers = await loadHandlers("bypass-source");
    const result = await handlers["tool_result"]({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-bypass-1",
      input: { command: "PI_RTK_BYPASS=1 echo hello" },
      content: [{ type: "text", text: "\u001b[32mhello\u001b[0m\n" }],
      details: undefined,
      isError: false,
    });

    expect(result.content[0].text).toBe("hello\n");
    expect(result.details.compressionInfo).toMatchObject({
      technique: "none",
      bypassedBy: "env-var",
    });
    expect(result.details.bashOriginalOutput).toMatchObject({
      source: "pi-visible",
      restoredContentForRtk: false,
      visibleLineCount: 2,
    });
  });


  it("joins multiple text chunks and preserves non-text chunks for ordinary output", async () => {
    const handlers = await loadHandlers("chunks");
    const nonText = { type: "image", data: "opaque-test-data" };
    const result = await handlers["tool_result"]({
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
