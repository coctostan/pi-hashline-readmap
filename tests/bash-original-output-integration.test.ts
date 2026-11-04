import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

// The close input of slice 10 (Only Pi's metadata names its full output): a command's own
// `Full output: <temp path>` line, with no Pi truncation behind it.
function decoyGitLog(dir: string) {
  const decoyPath = join(dir, "decoy.txt");
  writeFileSync(decoyPath, "DECOY CONTENT\n", "utf8");
  const lines = [`a000000 Full output: ${decoyPath}`];
  for (let i = 1; i < 26; i++) lines.push(`a${String(i).padStart(6, "0")} commit ${i}`);
  return { decoyPath, visible: `${lines.join("\n")}\n` };
}

async function runDecoy(tag: string, dir: string) {
  const { visible } = decoyGitLog(dir);
  const handlers = await loadHandlers(tag);
  const result = await handlers["tool_result"]({
    type: "tool_result",
    toolName: "bash",
    toolCallId: `bash-${tag}`,
    input: { command: "git log --oneline" },
    content: [{ type: "text", text: visible }],
    details: undefined,
    isError: false,
  });
  return { visible, result, text: result.content[0].text as string };
}

describe("bash original output integration", () => {
  it("restores readable full-output file contents and preserves existing details", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-full-"));
    const fullPath = join(dir, "output.txt");
    writeFileSync(fullPath, "FULL git output\n", "utf8");

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

      expect(result.content[0].text).toBe("FULL git output\n");
      expect(result.details.existing).toBe("keep");
      expect(result.details.contextHygiene.classification).toBe("command-output");
      expect(result.details.bashOriginalOutput).toMatchObject({
        source: "pi-full-output-path",
        restoredContentForRtk: true,
        originalPath: fullPath,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("strips ANSI and keeps source-selection metadata", async () => {
    const handlers = await loadHandlers("ansi-source");
    const result = await handlers["tool_result"]({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-ansi-1",
      input: { command: "echo hello" },
      content: [{ type: "text", text: "\u001b[32mhello\u001b[0m\n" }],
      details: undefined,
      isError: false,
    });

    expect(result.content[0].text).toBe("hello\n");
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

  it("presents a command's own Full output: line as printed, never the file it names", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-decoy-on-"));
    const { visible, result, text } = await runDecoy("decoy-guard-on", dir);
    try {
      expect(text).toBe(visible);
      expect(result.details.bashOriginalOutput).toMatchObject({ source: "pi-visible", restoredContentForRtk: false, snapshotWritten: false });
      expect(result.details.bashOriginalOutput.originalPath).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe("with the context guard off (PI_HASHLINE_BASH_CONTEXT_GUARD=0)", () => {
    const saved = process.env.PI_HASHLINE_BASH_CONTEXT_GUARD;
    beforeEach(() => { process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = "0"; });
    afterEach(() => {
      if (saved === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD;
      else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = saved;
    });

    it("names Pi's full-output file when Pi truncated, without restoring it", async () => {
      const dir = mkdtempSync(join(tmpdir(), "hashline-guard-off-full-"));
      const fullPath = join(dir, "output.txt");
      writeFileSync(fullPath, "FULL git output\n", "utf8");
      try {
        const handlers = await loadHandlers("guard-off-full");
        const visible = `VISIBLE TAIL\n[Showing lines 10-20 of 20. Full output: ${fullPath}]`;
        const result = await handlers["tool_result"]({
          type: "tool_result",
          toolName: "bash",
          toolCallId: "bash-guard-off-full",
          input: { command: "git diff" },
          content: [{ type: "text", text: visible }],
          details: { fullOutputPath: fullPath },
          isError: false,
        });
        expect(result.content[0].text).toBe(visible);
        expect(result.details.bashOriginalOutput).toMatchObject({
          source: "pi-full-output-path",
          restoredContentForRtk: false,
          originalPath: fullPath,
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("saves no snapshot when Pi did not truncate, a command's own Full output: line included", async () => {
      const dir = mkdtempSync(join(tmpdir(), "hashline-decoy-off-"));
      const { visible, result, text } = await runDecoy("decoy-guard-off", dir);
      try {
        expect(text).toBe(visible);
        expect(result.details.bashOriginalOutput).toBeUndefined();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});
