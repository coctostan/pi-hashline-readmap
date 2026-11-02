import { describe, it, expect, vi } from "vitest";
import { readFileSync, rmSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import * as git from "../src/rtk/git.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function makeBashEvent(toolCallId: string, command: string, text: string, details?: unknown) {
  return {
    type: "tool_result" as const,
    toolName: "bash",
    toolCallId,
    input: { command },
    content: [{ type: "text" as const, text }],
    isError: false,
    details,
  };
}

async function loadHandler(tag: string) {
  const modUrl = pathToFileURL(resolve(root, "index.ts")).href + "?t=" + tag + "-" + Date.now();
  const handlers: Record<string, Function> = {};
  const mockPi = {
    registerTool() {},
    on(event: string, handler: Function) {
      handlers[event] = handler;
    },
    events: { emit() {}, on() {} },
  };
  const mod = await import(modUrl);
  mod.default(mockPi as any);
  return handlers["tool_result"];
}

describe("details.rtkCompaction — main RTK path (single technique)", () => {
  it("populates details.rtkCompaction and details.ptcValue.rtkCompaction with applied=true when a route modifies output", async () => {
    const handler = await loadHandler("main");
    const gitSpy = vi.spyOn(git, "compactGitOutput").mockReturnValue("compressed\n");
    try {
      const result = await handler(
        makeBashEvent("t-main", "git status", "M file.ts\n?? other.ts\n", { existing: "keep" }),
      );
      expect(result).toBeDefined();
      expect(result.details.existing).toBe("keep");
      expect(result.details.compressionInfo).toBeDefined(); // additive — existing field stays
      expect(result.details.rtkCompaction).toBeDefined();
      expect(result.details.rtkCompaction.applied).toBe(true);
      expect(result.details.rtkCompaction.techniques).toEqual(["git"]);
      expect(result.details.rtkCompaction.truncated).toBe(false);
      expect(typeof result.details.rtkCompaction.originalLineCount).toBe("number");
      expect(typeof result.details.rtkCompaction.compactedLineCount).toBe("number");
      expect(result.details.ptcValue).toBeDefined();
      expect(result.details.ptcValue.rtkCompaction).toEqual(result.details.rtkCompaction);
    } finally {
      gitSpy.mockRestore();
    }
  });

  it("populates details.rtkCompaction with applied=false when no route matches", async () => {
    const handler = await loadHandler("noroute");
    const result = await handler(makeBashEvent("t-noroute", "echo hello", "hello\n"));
    expect(result).toBeDefined();
    expect(result.details.rtkCompaction).toBeDefined();
    expect(result.details.rtkCompaction.applied).toBe(false);
    expect(result.details.rtkCompaction.techniques).toEqual([]);
    expect(result.details.rtkCompaction.truncated).toBe(false);
    expect(result.details.ptcValue?.rtkCompaction).toEqual(result.details.rtkCompaction);
  });

  it("reports applied=false when only the anti-pattern hint was added", async () => {
    const handler = await loadHandler("hint-only");
    const result = await handler(makeBashEvent("t-hint", "find src -name '*.ts'", "src/a.ts\nsrc/b.ts\n"));
    expect(result.content[0].text).toContain("[Hint: ");
    expect(result.details.rtkCompaction).toEqual({
      applied: false,
      techniques: [],
      truncated: false,
      dropped: [],
      originalLineCount: 3,
      compactedLineCount: 5, // the hint's lines included
    });
    expect(result.details.ptcValue?.rtkCompaction).toEqual(result.details.rtkCompaction);
  });
});


describe("details.rtkCompaction — PI_RTK_BYPASS path", () => {
  it("populates rtkCompaction with applied=false, techniques=[], truncated=false on PI_RTK_BYPASS=1", async () => {
    const handler = await loadHandler("bypass");
    const result = await handler(
      makeBashEvent("t-bypass", "PI_RTK_BYPASS=1 git status", "M file.ts\n"),
    );
    expect(result.details.rtkCompaction).toEqual({
      applied: false,
      techniques: [],
      truncated: false,
      dropped: [],
      originalLineCount: expect.any(Number),
      compactedLineCount: expect.any(Number),
    });
    expect(result.details.ptcValue?.rtkCompaction).toEqual(result.details.rtkCompaction);
  });
});

describe("details.rtkCompaction — empty-input fast path", () => {
  it("populates rtkCompaction with applied=false, techniques=[], truncated=false and omits line counts on empty bash output", async () => {
    const handler = await loadHandler("empty");
    const result = await handler(makeBashEvent("t-empty", "echo -n", ""));
    expect(result).toBeDefined();
    expect(result.details.rtkCompaction).toBeDefined();
    expect(result.details.rtkCompaction.applied).toBe(false);
    expect(result.details.rtkCompaction.techniques).toEqual([]);
    expect(result.details.rtkCompaction.truncated).toBe(false);
    expect(result.details.rtkCompaction.originalLineCount).toBeUndefined();
    expect(result.details.rtkCompaction.compactedLineCount).toBeUndefined();
    expect(result.details.ptcValue?.rtkCompaction).toEqual(result.details.rtkCompaction);
  });
});

describe("details.rtkCompaction — test-output short-circuit", () => {
  it("reports techniques=['test-output'] when stripAnsi modified the output", async () => {
    const handler = await loadHandler("testout-applied");
    const result = await handler(
      makeBashEvent("t-test-applied", "npm test", "\u001b[32mPASS\u001b[0m foo.test.ts\n"),
    );
    expect(result.details.rtkCompaction.applied).toBe(true);
    expect(result.details.rtkCompaction.techniques).toEqual(["test-output"]);
    expect(result.details.rtkCompaction.truncated).toBe(false);
    expect(result.details.ptcValue?.rtkCompaction).toEqual(result.details.rtkCompaction);
  });

  it("reports techniques=[] when test-output input has no ANSI to strip", async () => {
    const handler = await loadHandler("testout-noop");
    const result = await handler(makeBashEvent("t-test-noop", "vitest run", "PASS foo.test.ts\n"));
    expect(result.details.rtkCompaction.applied).toBe(false);
    expect(result.details.rtkCompaction.techniques).toEqual([]);
    expect(result.details.ptcValue?.rtkCompaction).toEqual(result.details.rtkCompaction);
  });
});


describe("details.rtkCompaction — dropped end-to-end", () => {
  it("reports the route's drops as dropped and sets truncated, mirrored at ptcValue", async () => {
    const handler = await loadHandler("dropped");
    // The dropped 21st line reads like the marker that replaces it.
    const lines = Array.from({ length: 20 }, (_, i) => `abc${String(i).padStart(4, "0")} subject ${i}`);
    const rawInput = [...lines, "... and 1 more lines"].join("\n") + "\n";
    const result = await handler(makeBashEvent("t-dropped", "git log --oneline", rawInput));
    expect(result.details.rtkCompaction).toMatchObject({
      applied: true,
      techniques: ["git"],
      truncated: true,
      dropped: [{ count: 1, unit: "lines" }],
    });
    expect(result.details.ptcValue?.rtkCompaction).toEqual(result.details.rtkCompaction);
  });
});

describe("RTK notice — Original output names the saved pre-RTK copy", () => {
  it("names a 0600 file holding the pre-RTK output byte for byte, and no Full output:", async () => {
    const handler = await loadHandler("original-output");
    const lines = Array.from({ length: 21 }, (_, i) => `abc${String(i).padStart(4, "0")} subjéct ${i}`);
    const rawInput = lines.join("\n") + "\n";
    const result = await handler(makeBashEvent("t-original", "git log --oneline", rawInput));
    const text: string = result.content[0].text;
    const match = text.match(
      /^\[RTK: compressed git output .* \(-?\d+% saved\)\. Original output: (\S+)\. Use `PI_RTK_BYPASS=1 git log --oneline` to re-run uncompressed\.\]\n/,
    );
    expect(match, text).not.toBeNull();
    const path = match![1];
    try {
      expect(readFileSync(path)).toEqual(Buffer.from(rawInput, "utf8"));
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(text).not.toContain("Full output:");
      expect(result.details.bashOriginalOutput).toMatchObject({ originalPath: path, snapshotWritten: true });
    } finally {
      rmSync(path, { force: true });
    }
  });

  it("leaves the output uncompacted when its original cannot be saved", async () => {
    const handler = await loadHandler("original-fail");
    const saved = process.env.TMPDIR;
    process.env.TMPDIR = "/nonexistent-hashline-tmpdir";
    try {
      const lines = Array.from({ length: 21 }, (_, i) => `abc${String(i).padStart(4, "0")} subject ${i}`);
      const rawInput = lines.join("\n");
      const result = await handler(makeBashEvent("t-original-fail", "git log --oneline", rawInput));
      expect(result.content[0].text).toBe(rawInput);
      expect(result.details.rtkCompaction).toMatchObject({ applied: false, dropped: [] });
      expect(result.details.compressionInfo.bypassedBy).toBe("unsaved-original");
      expect(result.details.bashOriginalOutput.snapshotWriteError).toContain("ENOENT");
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });

  it("saves nothing for an uncompacted result", async () => {
    const handler = await loadHandler("original-none");
    const result = await handler(makeBashEvent("t-original-none", "echo hello", "hello\n"));
    expect(result.content[0].text).toBe("hello\n");
    expect(result.details.bashOriginalOutput?.originalPath).toBeUndefined();
  });
});
