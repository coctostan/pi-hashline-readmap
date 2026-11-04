import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
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
    vi.restoreAllMocks();
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

  it("guards after doom-loop warnings are assembled while preserving non-text content", async () => {
    const handlers = await loadHandlers("after-doom");
    const nonText = { type: "image", data: "opaque" };
    const input = { command: "git diff" };

    handlers.tool_call({ toolName: "bash", toolCallId: "loop-1", input });
    handlers.tool_call({ toolName: "bash", toolCallId: "loop-2", input });
    handlers.tool_call({ toolName: "bash", toolCallId: "bash-guard-after-doom", input });

    const result = await handlers.tool_result({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-guard-after-doom",
      input,
      content: [{ type: "text", text: ["raw-1", "raw-2", "raw-3", "raw-4"].join("\n") }, nonText],
      details: { existing: "kept" },
      isError: false,
    });

    expect(result.content[0].text).toContain("[Bash context guard: preview]");
    expect(result.content[0].text).toContain("Preserved notices:");
    expect(result.content[0].text).toContain("⚠ REPEATED-CALL WARNING: This is the 3rd identical tool call.");
    expect(result.content[0].text).toContain("raw-4");
    expect(result.content[0].text).not.toContain("raw-2");
    expect(result.content.slice(1)).toEqual([nonText]);
    expect(result.details.existing).toBe("kept");
    expect(result.details.bashContextGuard).toMatchObject({
      enabled: true,
      trimmed: true,
      trimWanted: true,
      maxLines: 3,
      headLines: 1,
      tailLines: 1,
    });
    expect(result.details.bashContextGuard.postRtkLineCount).toBeGreaterThan(4);
    expect(result.details.bashOriginalOutput).toMatchObject({ source: "pi-visible" });
  });

  it("feature flag disables original restoration and final guard trimming while naming Pi's file", async () => {
    process.env.PI_HASHLINE_BASH_CONTEXT_GUARD = "0";
    const dir = mkdtempSync(join(tmpdir(), "hashline-guard-disabled-"));
    const fullPath = join(dir, "full.txt");
    writeFileSync(fullPath, "FULL\nFULL\nFULL\nFULL\n", "utf8");
    const visible = `VISIBLE\n[Showing lines 1-1 of 4. Full output: ${fullPath}]`;

    try {
      const handlers = await loadHandlers("disabled");
      const result = await handlers.tool_result({
        type: "tool_result",
        toolName: "bash",
        toolCallId: "bash-guard-disabled",
        input: { command: "git diff" },
        content: [{ type: "text", text: visible }],
        details: { fullOutputPath: fullPath },
        isError: false,
      });

      expect(result.content[0].text).toBe(visible);
      expect(result.details.bashOriginalOutput).toMatchObject({ restoredContentForRtk: false, originalPath: fullPath });
      expect(result.details.bashContextGuard).toMatchObject({ enabled: false, trimmed: false, trimWanted: false });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("writes an original snapshot when stricter guard env trims without a Pi full-output path", async () => {
    const handlers = await loadHandlers("trim-snapshot");

    const result = await handlers.tool_result({
      type: "tool_result",
      toolName: "bash",
      toolCallId: "bash-guard-trim-snapshot",
      input: { command: "git diff" },
      content: [{ type: "text", text: ["v-1", "v-2", "v-3", "v-4"].join("\n") }],
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
    const originalPath = result.details.bashOriginalOutput.originalPath;
    expect(result.content[0].text).toContain(`Original/pre-RTK output: ${originalPath}`);
  });
});
