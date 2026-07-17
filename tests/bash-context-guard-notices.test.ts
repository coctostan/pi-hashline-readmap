import { describe, expect, it } from "vitest";
import { applyBashContextGuard } from "../src/rtk/bash-context-guard.js";

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("guarded Bash preview protected notices", () => {
  it("deduplicates protected notices, removes wrapper lines, and truncates the command in the header", () => {
    const hintNotice = "[Hint: Prefer the read tool for file contents.]";
    const exitNotice = "Command exited with code 1";
    const text = [
      hintNotice,
      "Ran bash command: git diff --stat",
      "body-1",
      exitNotice,
      "body-2",
      hintNotice,
      "body-3",
      exitNotice,
      "body-4",
    ].join("\n");
    const longCommand = `node ${"x".repeat(200)}`;
    const expectedCommand = longCommand.slice(0, 117) + "...";

    const result = applyBashContextGuard({
      text,
      command: longCommand,
      config: { enabled: true, maxLines: 4, maxBytes: 4096, headLines: 1, tailLines: 1 },
      fs: {
        randomId: () => "notice-id",
        tempDir: () => "/tmp",
        writeFile() {},
      },
    });

    expect(result.text).toContain("Preserved notices:");
    expect(occurrences(result.text, hintNotice)).toBe(1);
    expect(occurrences(result.text, exitNotice)).toBe(1);
    expect(result.text).not.toContain("Ran bash command");
    expect(result.text).toContain(`Command: ${expectedCommand}`);
    expect(result.text).toContain("Head:\nbody-1");
    expect(result.text).toContain("Tail:\nbody-4");
    expect(result.metadata.preservedNoticeCount).toBe(2);
  });

  it("protects pi full-output notices and stable doom-loop warning lines", () => {
    const fullOutputNotice = "[Showing lines 1-2 of 10. Full output: /tmp/full-output.txt]";
    const doomLoopNotice = "⚠ REPEATED-CALL WARNING: This is the 3rd identical tool call.";
    const text = [fullOutputNotice, "body-1", doomLoopNotice, "body-2", "body-3"].join("\n");

    const result = applyBashContextGuard({
      text,
      config: { enabled: true, maxLines: 3, maxBytes: 4096, headLines: 1, tailLines: 1 },
      fs: {
        randomId: () => "doom-id",
        tempDir: () => "/tmp",
        writeFile() {},
      },
    });

    expect(result.text).toContain("Preserved notices:");
    expect(result.text).toContain(fullOutputNotice);
    expect(result.text).toContain(doomLoopNotice);
    expect(result.metadata.preservedNoticeCount).toBe(2);
  });
});
