import { describe, expect, it } from "vitest";
import { applyBashContextGuard } from "../src/rtk/bash-context-guard.js";

describe("applyBashContextGuard trimming", () => {
  it("writes full Bash output before replacing line-over-limit output with a recoverable preview", () => {
    const text = ["line-1", "line-2", "line-3", "line-4", "line-5", "line-6"].join("\n");
    const writes: Array<{ path: string; content: string; options: { mode: number; flag: string } }> = [];

    const result = applyBashContextGuard({
      text,
      command: "npm test -- --runInBand",
      originalMetadata: {
        enabled: true,
        source: "pi-full-output-path",
        restoredContentForRtk: true,
        originalPath: "/tmp/original-output.txt",
        snapshotNeeded: false,
        snapshotWritten: false,
        originalLineCount: 10,
        originalByteCount: 300,
        visibleLineCount: 2,
        visibleByteCount: 40,
      },
      config: { enabled: true, maxLines: 5, maxBytes: 1024, headLines: 2, tailLines: 2 },
      fs: {
        randomId: () => "fixed-id",
        tempDir: () => "/tmp",
        writeFile(path, content, options) {
          writes.push({ path, content, options });
        },
      },
    });

    expect(writes).toEqual([
      {
        path: "/tmp/hashline-bash-output-fixed-id.txt",
        content: text,
        options: { mode: 0o600, flag: "wx" },
      },
    ]);
    expect(result.text).not.toBe(text);
    expect(result.text).toContain("[Bash context guard: preview]");
    expect(result.text).toContain("Full Bash output: /tmp/hashline-bash-output-fixed-id.txt");
    expect(result.text).toContain("Original Bash output: /tmp/original-output.txt");
    expect(result.text).toContain("Original: 10 lines, 300 bytes");
    expect(result.text).toContain(`Guard input: 6 lines, ${Buffer.byteLength(text, "utf8")} bytes`);
    expect(result.text).toContain("Trigger thresholds: 5 lines, 1024 bytes");
    expect(result.text).not.toContain("Limits: 5 lines, 1024 bytes");
    expect(result.text).toContain("Command: npm test -- --runInBand");
    expect(result.text).toContain("Head:");
    expect(result.text).toContain("line-1\nline-2");
    expect(result.text).toContain("... omitted 2 lines");
    expect(result.text).toContain("Tail:");
    expect(result.text).toContain("line-5\nline-6");
    expect(result.text).not.toContain("use tool");
    expect(result.metadata).toMatchObject({
      enabled: true,
      trimmed: true,
      trimWanted: true,
      postRtkLineCount: 6,
      postRtkByteCount: Buffer.byteLength(text, "utf8"),
      maxLines: 5,
      maxBytes: 1024,
      headLines: 2,
      tailLines: 2,
      postRtkOutputPath: "/tmp/hashline-bash-output-fixed-id.txt",
      preservedNoticeCount: 0,
    });
  });

  it("leaves byte-over-limit output unchanged when writing the recoverable file fails", () => {
    const text = "0123456789";

    const result = applyBashContextGuard({
      text,
      config: { enabled: true, maxLines: 20, maxBytes: 5, headLines: 1, tailLines: 1 },
      fs: {
        randomId: () => "fixed-id",
        tempDir: () => "/tmp",
        writeFile() {
          throw new Error("disk full");
        },
      },
    });

    expect(result.text).toBe(text);
    expect(result.metadata).toMatchObject({
      enabled: true,
      trimmed: false,
      trimWanted: true,
      postRtkLineCount: 1,
      postRtkByteCount: 10,
      maxLines: 20,
      maxBytes: 5,
      headLines: 1,
      tailLines: 1,
      postRtkWriteError: "disk full",
    });
    expect(result.metadata.postRtkOutputPath).toBeUndefined();
  });


  it("keeps byte-over-limit single-line previews concise after writing the recoverable file", () => {
    const text = "x".repeat(10_000);
    const writes: Array<{ path: string; content: string; options: { mode: number; flag: string } }> = [];

    const result = applyBashContextGuard({
      text,
      config: { enabled: true, maxLines: 20, maxBytes: 5, headLines: 1, tailLines: 1 },
      fs: {
        randomId: () => "long-line-id",
        tempDir: () => "/tmp",
        writeFile(path, content, options) {
          writes.push({ path, content, options });
        },
      },
    });

    expect(writes).toEqual([
      {
        path: "/tmp/hashline-bash-output-long-line-id.txt",
        content: text,
        options: { mode: 0o600, flag: "wx" },
      },
    ]);
    expect(result.text).toContain("[Bash context guard: preview]");
    expect(result.text).toContain("[truncated preview line: 10000 bytes total");
    expect(result.text).not.toContain(text);
    expect(Buffer.byteLength(result.text, "utf8")).toBeLessThan(2_500);
  });
});
