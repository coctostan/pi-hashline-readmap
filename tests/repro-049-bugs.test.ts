/**
 * Reproduction tests for batch issue 049:
 * - 041: TypeScript typecheck failures (typecheck-only; covered by `npm run typecheck`)
 * - 042: RTK build compressor produces empty string for all-noise input
 * - 043: Transfer compressor ineffective (savedChars=0) for rsync/scp
 * - 044: Transfer compressor misses lowercase scp unit variants (kB/s)
 *
 * All tests below PASS (assert the *buggy* behavior) and should FAIL after the fix.
 */
import { describe, it, expect } from "vitest";
import { compressBuildToolsOutput } from "../src/rtk/build-tools.js";
import { compressTransferOutput } from "../src/rtk/transfer.js";
import { filterBashOutput } from "../src/rtk/bash-filter.js";

// ── Issue 042: Build compressor produces empty string ───────────────────────

describe("Issue 042: compressBuildToolsOutput empty string on all-noise input", () => {
  it("cmake progress-only output returns null (not empty string)", () => {
    // 15 lines, all cmake progress noise — no signal lines
    const cmakeOut =
      Array.from({ length: 15 }, (_, i) => `[ ${String(i + 1).padStart(2)}%] Building ...`).join("\n") + "\n";
    const result = compressBuildToolsOutput(cmakeOut);
    // Fixed: returns null instead of "" — filterBashOutput falls through to stripped original
    expect(result).toBeNull();
  });

  it("filterBashOutput output is not blank for cmake progress-only", () => {
    const cmakeOut =
      Array.from({ length: 15 }, (_, i) => `[ ${String(i + 1).padStart(2)}%] Building ...`).join("\n") + "\n";
    const result = filterBashOutput("cmake --build .", cmakeOut);
    // Fixed: output is the stripped original, not blank
    expect(result.output).not.toBe("");
    expect(result.savedChars).toBeGreaterThanOrEqual(0);
  });

  it("all-noise Gradle task output returns null (not empty string)", () => {
    // 15 lines, all Gradle task noise — no signal lines
    const gradleOut = Array.from({ length: 15 }, (_, i) => `> Task :compile${i}`).join("\n") + "\n";
    const result = compressBuildToolsOutput(gradleOut);
    // Fixed: returns null instead of ""
    expect(result).toBeNull();
  });
});

// ── Issue 042 (transfer): compressTransferOutput empty string on all-noise input ──

describe("Issue 042 (transfer): compressTransferOutput empty string on all-noise input", () => {
  it("all-noise scp progress lines (no signal) return null, not empty string", () => {
    // 15 lines of uppercase KB/s scp progress, no signal lines at all
    // SCP_PROGRESS_RE matches every line → kept = [] → currently returns ""
    const scpOutput = Array(15)
      .fill("file.txt                    100%  1234   1.2KB/s   00:00")
      .join("\n");

    const result = compressTransferOutput(scpOutput);
    // Fixed: returns null instead of "" — filterBashOutput falls through to stripped original
    expect(result).toBeNull();
  });
});

// ── Issue 043: Transfer compressor strips rsync -av per-file listing ─────────────

describe("Issue 043: compressTransferOutput strips rsync -av per-file listing", () => {
  it("rsync -av per-file listing lines ARE stripped", () => {
    // rsync -av without --progress lists filenames — these must be stripped
    const rsyncOutput = [
      "sending incremental file list",
      "src/file1.txt",
      "src/file2.txt",
      "src/file3.txt",
      "src/file4.txt",
      "src/file5.txt",
      "src/file6.txt",
      "src/file7.txt",
      "src/file8.txt",
      "src/file9.txt",
      "src/file10.txt",
      "src/file11.txt",
      "",
      "sent 1,234 bytes  received 56 bytes  2,580.00 bytes/sec",
      "total size is 10,000  speedup is 7.81",
    ].join("\n");
    const before = rsyncOutput.length;
    const result = compressTransferOutput(rsyncOutput)!;
    const savedChars = before - result.length;

    // Fixed: filename lines are now noise → savedChars > 0
    expect(savedChars).toBeGreaterThan(0);
  });

  it("filterBashOutput savedChars > 0 for rsync -av", () => {
    const rsyncOutput = [
      "sending incremental file list",
      "src/file1.txt",
      "src/file2.txt",
      "src/file3.txt",
      "src/file4.txt",
      "src/file5.txt",
      "src/file6.txt",
      "src/file7.txt",
      "src/file8.txt",
      "src/file9.txt",
      "src/file10.txt",
      "src/file11.txt",
      "",
      "sent 1,234 bytes  received 56 bytes  2,580.00 bytes/sec",
      "total size is 10,000  speedup is 7.81",
    ].join("\n");
    const result = filterBashOutput("rsync -av src/ dst/", rsyncOutput);
    // Fixed: transfer compressor now provides value for rsync -av output
    expect(result.savedChars).toBeGreaterThan(0);
  });

  it("uppercase KB/s scp lines ARE stripped (regression guard)", () => {
    // This worked before and must continue to work
    const progressLine = "file.txt                    100%  1234   1.2KB/s   00:00";
    const scpOutput = Array(15).fill(progressLine).join("\n") + "\nsent 50000 bytes";
    const before = scpOutput.length;
    const result = compressTransferOutput(scpOutput)!;
    const savedChars = before - result.length;

    expect(savedChars).toBeGreaterThan(0); // still works
  });
});

// ── Issue 044: Transfer compressor matches lowercase scp unit variants ──────────

describe("Issue 044: compressTransferOutput matches lowercase scp unit variants", () => {
  it("scp progress line with lowercase kB/s is stripped", () => {
    // SCP_PROGRESS_RE now uses [KMGkmg] — lowercase k matched
    const progressLine = "file.txt                    100%  1234   1.2kB/s   00:00";
    const scpOutput = Array(15).fill(progressLine).join("\n") + "\ntransfer complete";

    const result = compressTransferOutput(scpOutput)!;
    // Fixed: noise line stripped, not present in output
    expect(result).not.toContain("1.2kB/s");
  });

  it("uppercase KB/s IS stripped (regression guard)", () => {
    const progressLine = "file.txt                    100%  1234   1.2KB/s   00:00";
    const scpOutput = Array(15).fill(progressLine).join("\n") + "\ntransfer complete";

    const result = compressTransferOutput(scpOutput)!;
    expect(result).not.toContain("1.2KB/s"); // uppercase still works
  });

  it("lowercase mB/s is stripped", () => {
    const progressLine = "bigfile.tar                 100%  51200   5.0mB/s   00:10";
    const scpOutput = Array(15).fill(progressLine).join("\n") + "\ntransfer complete";

    const result = compressTransferOutput(scpOutput)!;
    // Fixed: lowercase mB/s now matched by [KMGkmg]
    expect(result).not.toContain("5.0mB/s");
  });
});
