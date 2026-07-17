import { describe, it, expect, vi } from "vitest";
import { ensureBashOriginalOutputSnapshot, selectBashOriginalOutput } from "../src/rtk/bash-original-output.js";

describe("selectBashOriginalOutput", () => {
  it("uses visible text and records counts without snapshot for small output", () => {
    const writeFile = vi.fn();
    const result = selectBashOriginalOutput({
      visibleText: "one\né\n",
      snapshotMaxLines: 10,
      snapshotMaxBytes: 100,
      fs: {
        readFile: vi.fn(),
        writeFile,
        randomId: () => "fixed",
        tempDir: () => "/tmp",
      },
    });

    expect(result.inputForRtk).toBe("one\né\n");
    expect(result.metadata).toMatchObject({
      enabled: true,
      source: "pi-visible",
      restoredContentForRtk: false,
      snapshotNeeded: false,
      snapshotWritten: false,
      originalLineCount: 3,
      originalByteCount: 7,
      visibleLineCount: 3,
      visibleByteCount: 7,
    });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("uses a readable metadata full-output path as selected output without snapshotting", () => {
    const readFile = vi.fn().mockReturnValue("full\nbody\n");
    const writeFile = vi.fn();

    const result = selectBashOriginalOutput({
      visibleText: "tail",
      fullOutputPath: "/tmp/pi-full-output.txt",
      snapshotMaxLines: 1,
      snapshotMaxBytes: 1,
      fs: {
        readFile,
        writeFile,
        randomId: () => "fixed",
        tempDir: () => "/tmp",
      },
    });

    expect(readFile).toHaveBeenCalledWith("/tmp/pi-full-output.txt");
    expect(result.inputForRtk).toBe("full\nbody\n");
    expect(result.metadata).toMatchObject({
      source: "pi-full-output-path",
      restoredContentForRtk: true,
      originalPath: "/tmp/pi-full-output.txt",
      snapshotNeeded: false,
      snapshotWritten: false,
      originalLineCount: 3,
      originalByteCount: 10,
      visibleLineCount: 1,
      visibleByteCount: 4,
    });
    expect(writeFile).not.toHaveBeenCalled();
  });


  it("uses a readable metadata full-output path even when visible output is empty", () => {
    const readFile = vi.fn().mockReturnValue("full from empty visible\n");
    const writeFile = vi.fn();

    const result = selectBashOriginalOutput({
      visibleText: "",
      fullOutputPath: "/tmp/pi-full-output-empty-visible.txt",
      fs: {
        readFile,
        writeFile,
        randomId: () => "fixed",
        tempDir: () => "/tmp",
      },
    });

    expect(readFile).toHaveBeenCalledWith("/tmp/pi-full-output-empty-visible.txt");
    expect(result.inputForRtk).toBe("full from empty visible\n");
    expect(result.metadata).toMatchObject({
      source: "pi-full-output-path",
      restoredContentForRtk: true,
      originalPath: "/tmp/pi-full-output-empty-visible.txt",
      visibleLineCount: 0,
      visibleByteCount: 0,
      originalLineCount: 2,
      originalByteCount: 24,
    });
    expect(writeFile).not.toHaveBeenCalled();
  });


  it("detects visible full-output notices and prefers metadata paths", () => {
    const readFile = vi.fn((path: string) => `full from ${path}`);

    const visibleOnly = selectBashOriginalOutput({
      visibleText: "tail\n\n[Showing lines 9-10 of 10. Full output: /tmp/from-notice.txt]",
      fs: { readFile, writeFile: vi.fn(), randomId: () => "fixed", tempDir: () => "/tmp" },
    });
    expect(visibleOnly.inputForRtk).toBe("full from /tmp/from-notice.txt");
    expect(visibleOnly.metadata?.originalPath).toBe("/tmp/from-notice.txt");

    readFile.mockClear();
    const metadataWins = selectBashOriginalOutput({
      visibleText: "tail\n[Output truncated. Full output: /tmp/from-notice.txt]",
      fullOutputPath: "/tmp/from-metadata.txt",
      fs: { readFile, writeFile: vi.fn(), randomId: () => "fixed", tempDir: () => "/tmp" },
    });
    expect(readFile).toHaveBeenCalledWith("/tmp/from-metadata.txt");
    expect(metadataWins.inputForRtk).toBe("full from /tmp/from-metadata.txt");
  });


  it("falls back to visible text and records metadata when full-output read fails", () => {
    const result = selectBashOriginalOutput({
      visibleText: "visible tail",
      fullOutputPath: "/tmp/missing.txt",
      snapshotMaxLines: 99,
      snapshotMaxBytes: 999,
      fs: {
        readFile: () => { throw new Error("EACCES: permission denied"); },
        writeFile: vi.fn(),
        randomId: () => "fixed",
        tempDir: () => "/tmp",
      },
    });

    expect(result.inputForRtk).toBe("visible tail");
    expect(result.metadata).toMatchObject({
      source: "pi-visible-fallback",
      restoredContentForRtk: false,
      snapshotNeeded: false,
      snapshotWritten: false,
      visibleLineCount: 1,
      visibleByteCount: 12,
      originalLineCount: 1,
      originalByteCount: 12,
    });
    expect(result.metadata?.fullOutputReadError).toContain("EACCES: permission denied");
  });


  it("writes a flat restrictive snapshot when visible line count exceeds the threshold", () => {
    const writeFile = vi.fn();
    const result = selectBashOriginalOutput({
      visibleText: "a\nb\nc\nd",
      snapshotMaxLines: 3,
      snapshotMaxBytes: 1000,
      fs: {
        readFile: vi.fn(),
        writeFile,
        randomId: () => "fixed-id",
        tempDir: () => "/tmp/hashline-test",
      },
    });

    expect(result.inputForRtk).toBe("a\nb\nc\nd");
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/hashline-test/hashline-bash-original-fixed-id.txt",
      "a\nb\nc\nd",
      { mode: 0o600, flag: "wx" },
    );
    expect(result.metadata).toMatchObject({
      source: "pi-visible",
      snapshotNeeded: true,
      snapshotWritten: true,
      snapshotPath: "/tmp/hashline-test/hashline-bash-original-fixed-id.txt",
      originalPath: "/tmp/hashline-test/hashline-bash-original-fixed-id.txt",
    });
  });


  it("writes a snapshot when visible byte count exceeds the threshold even if line count is small", () => {
    const writeFile = vi.fn();
    const result = selectBashOriginalOutput({
      visibleText: "ééé",
      snapshotMaxLines: 10,
      snapshotMaxBytes: 5,
      fs: {
        readFile: vi.fn(),
        writeFile,
        randomId: () => "byte-id",
        tempDir: () => "/tmp/hashline-test",
      },
    });

    expect(result.metadata).toMatchObject({
      snapshotNeeded: true,
      snapshotWritten: true,
      originalByteCount: 6,
      visibleByteCount: 6,
      snapshotPath: "/tmp/hashline-test/hashline-bash-original-byte-id.txt",
    });
    expect(writeFile).toHaveBeenCalledOnce();
  });


  it("keeps visible input and records metadata when snapshot writing fails", () => {
    const result = selectBashOriginalOutput({
      visibleText: "a\nb\nc\nd",
      snapshotMaxLines: 1,
      snapshotMaxBytes: 1000,
      fs: {
        readFile: vi.fn(),
        writeFile: () => { throw new Error("disk full"); },
        randomId: () => "fail-id",
        tempDir: () => "/tmp/hashline-test",
      },
    });

    expect(result.inputForRtk).toBe("a\nb\nc\nd");
    expect(result.metadata).toMatchObject({
      snapshotNeeded: true,
      snapshotWritten: false,
      originalPath: undefined,
      snapshotPath: undefined,
    });
    expect(result.metadata?.snapshotWriteError).toContain("disk full");
  });


  it("returns visible input without metadata or file I/O when source selection is disabled", () => {
    const readFile = vi.fn();
    const writeFile = vi.fn();
    const result = selectBashOriginalOutput({
      visibleText: "visible",
      fullOutputPath: "/tmp/full-output.txt",
      snapshotMaxLines: 0,
      snapshotMaxBytes: 0,
      enabled: false,
      fs: {
        readFile,
        writeFile,
        randomId: () => "disabled-id",
        tempDir: () => "/tmp/hashline-test",
      },
    });

    expect(result).toEqual({ inputForRtk: "visible" });
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });


  it("does not create snapshots or metadata for empty visible output without full-output content", () => {
    const writeFile = vi.fn();
    const result = selectBashOriginalOutput({
      visibleText: "",
      snapshotMaxLines: 0,
      snapshotMaxBytes: 0,
      fs: {
        readFile: vi.fn(),
        writeFile,
        randomId: () => "empty-id",
        tempDir: () => "/tmp/hashline-test",
      },
    });

    expect(result).toEqual({ inputForRtk: "" });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("records original snapshot write failures when forced at trim time", () => {
    const metadata = selectBashOriginalOutput({
      visibleText: "small original",
      snapshotMaxLines: 99,
      snapshotMaxBytes: 999,
      fs: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        randomId: () => "pre-existing-id",
        tempDir: () => "/tmp/hashline-test",
      },
    }).metadata;

    const result = ensureBashOriginalOutputSnapshot({
      visibleText: "small original",
      metadata,
      fs: {
        readFile: vi.fn(),
        writeFile: () => { throw new Error("disk full"); },
        randomId: () => "forced-fail-id",
        tempDir: () => "/tmp/hashline-test",
      },
    });

    expect(result).toMatchObject({
      source: "pi-visible",
      restoredContentForRtk: false,
      snapshotNeeded: true,
      snapshotWritten: false,
      snapshotPath: undefined,
      originalPath: undefined,
      originalLineCount: 1,
      originalByteCount: 14,
      visibleLineCount: 1,
      visibleByteCount: 14,
    });
    expect(result?.snapshotWriteError).toContain("disk full");
  });

  it("does not read non-temp full-output paths before validation", () => {
    const readFile = vi.fn(() => {
      throw new Error("BUG: unsafe read attempted");
    });
    const writeFile = vi.fn();

    const result = selectBashOriginalOutput({
      visibleText: "visible fallback",
      fullOutputPath: "/etc/passwd",
      snapshotMaxLines: 99,
      snapshotMaxBytes: 999,
      fs: {
        readFile,
        writeFile,
        randomId: () => "unsafe-path-id",
        tempDir: () => "/tmp/hashline-test",
      },
    });

    expect(readFile).not.toHaveBeenCalled();
    expect(result.inputForRtk).toBe("visible fallback");
    expect(result.metadata).toMatchObject({
      source: "pi-visible",
      restoredContentForRtk: false,
      snapshotNeeded: false,
      snapshotWritten: false,
    });
    expect(result.metadata?.fullOutputReadError).toBeUndefined();
  });
});
