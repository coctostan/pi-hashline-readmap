import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

async function loadHandlers(tag: string) {
  const modUrl = pathToFileURL(resolve(root, "index.ts")).href + `?bash-context-guard=${tag}-${Date.now()}`;
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

describe("bash context guard integration", () => {
  const saved = {
    enabled: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD,
    maxLines: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES,
    maxBytes: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES,
    headLines: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES,
    tailLines: process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES,
  };

  beforeEach(() => {
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = "3";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES = "4096";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES = "1";
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES = "1";
    delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD;
  });

  afterEach(() => {
    if (saved.enabled === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = saved.enabled;
    if (saved.maxLines === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_LINES = saved.maxLines;
    if (saved.maxBytes === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_MAX_BYTES = saved.maxBytes;
    if (saved.headLines === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_HEAD_LINES = saved.headLines;
    if (saved.tailLines === undefined) delete process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES;
    else process.env.PI_HASHLINE_BASH_CONTEXT_GUARD_TAIL_LINES = saved.tailLines;
  });

  it("does not guard non-bash tool results", async () => {
    const handlers = await loadHandlers("non-bash");

    const result = await handlers.tool_result({
      type: "tool_result",
      toolName: "read",
      toolCallId: "read-guard-skip",
      input: { path: "src/example.ts" },
      content: [{ type: "text", text: "plain read result" }],
      isError: false,
    });

    expect(result).toBeUndefined();
  });

  it("guards normalized output after hints and doom-loop warnings while preserving non-text content", async () => {
    const handlers = await loadHandlers("normalized-doom");
    const nonText = { type: "image", data: "opaque" };
    const input = { command: "cat README.md" };

    handlers.tool_call({ toolName: "bash", toolCallId: "loop-1", input });
    handlers.tool_call({ toolName: "bash", toolCallId: "loop-2", input });
    handlers.tool_call({ toolName: "bash", toolCallId: "bash-guard-normalized", input });

    const result = await handlers.tool_result({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-guard-normalized",
      input,
      content: [{ type: "text", text: "\x1b[32mraw-1\x1b[0m\nraw-2\nraw-3\nraw-4" }, nonText],
      details: { existing: "kept" },
      isError: false,
    });

    expect(result.content[0].text).toContain("[Bash context guard: preview]");
    expect(result.content[0].text).toContain("Preserved notices:");
    expect(result.content[0].text).toContain("[Hint: Prefer the read tool for file contents.]");
    expect(result.content[0].text).toContain("⚠ REPEATED-CALL WARNING: This is the 3rd identical tool call.");
    const fullOutput = readFileSync(result.details.bashContextGuard.postRtkOutputPath, "utf8");
    expect(fullOutput).toContain("raw-1");
    expect(fullOutput).not.toContain("\x1b");
    expect(result.content.slice(1)).toEqual([nonText]);
    expect(result.details.existing).toBe("kept");
    expect(result.details).not.toHaveProperty("compressionInfo");
    expect(result.details).not.toHaveProperty("rtkCompaction");
    expect(result.details.bashContextGuard).toMatchObject({
      enabled: true,
      trimmed: true,
      trimWanted: true,
      maxLines: 3,
      headLines: 1,
      tailLines: 1,
    });
    expect(result.details.bashOriginalOutput).toMatchObject({ source: "pi-visible" });
    rmSync(result.details.bashContextGuard.postRtkOutputPath, { force: true });
    rmSync(result.details.bashOriginalOutput.originalPath, { force: true });
  });

  it("does not restore a Pi full-output file or trim when the guard is disabled", async () => {
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = "0";
    const dir = mkdtempSync(join(tmpdir(), "hashline-guard-disabled-"));
    const fullPath = join(dir, "full.txt");
    writeFileSync(fullPath, "FULL\nFULL\nFULL\nFULL\n", "utf8");

    try {
      const handlers = await loadHandlers("disabled");
      const visible = `\x1b[32mVISIBLE\x1b[0m\n[Showing lines 1-1 of 4. Full output: ${fullPath}]`;
      const result = await handlers.tool_result({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-guard-disabled",
        input: { command: "echo visible" },
        content: [{ type: "text", text: visible }],
        details: { fullOutputPath: fullPath },
        isError: false,
      });

      expect(result.content[0].text).toBe(`VISIBLE\n[Showing lines 1-1 of 4. Full output: ${fullPath}]`);
      expect(result.content[0].text).not.toContain("FULL\nFULL");
      expect(result.details.bashOriginalOutput).toBeUndefined();
      expect(result.details.bashContextGuard).toMatchObject({ enabled: false, trimmed: false, trimWanted: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes an original-output snapshot when a stricter guard trims without a Pi full-output path", async () => {
    const handlers = await loadHandlers("trim-snapshot");

    const result = await handlers.tool_result({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-guard-trim-snapshot",
      input: { command: "echo output" },
      content: [{ type: "text", text: ["VISIBLE-1", "VISIBLE-2", "VISIBLE-3", "VISIBLE-4"].join("\n") }],
      isError: false,
    });

    expect(result.details.bashContextGuard).toMatchObject({ enabled: true, trimmed: true, trimWanted: true });
    expect(result.details.bashOriginalOutput).toMatchObject({
      source: "pi-visible",
      restoredContentForRtk: false,
      snapshotNeeded: true,
      snapshotWritten: true,
    });
    expect(result.details.bashOriginalOutput.originalPath).toEqual(expect.any(String));
    expect(result.details.bashOriginalOutput.snapshotPath).toEqual(expect.any(String));
    expect(result.content[0].text).toContain("Original Bash output:");
  });
});
