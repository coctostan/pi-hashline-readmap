/**
 * Reproduction tests for batch issue 050:
 * - 045: Binary file detection only checks NUL bytes — NUL-free binaries silently garble
 * - 046: Grep anchors/snippets wrong on bare-CR line-ending files
 * - 047: Grep silently returns 0 matches on non-NUL binary-ish files containing ASCII
 * - 048: TS source imports use .js specifiers — blocks node --experimental-strip-types
 *
 * All tests below FAIL (assert the *buggy* behavior) and should PASS after the fix.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { registerReadTool } from "../src/read.js";
import { registerGrepTool } from "../src/grep.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tmpDir = join(__dirname, ".tmp-050");

// ─── Helpers ────────────────────────────────────────────────────────────────

async function callReadTool(params: { path: string; offset?: number; limit?: number }) {
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerReadTool(mockPi as any);
  return capturedTool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

async function callGrepTool(params: { pattern: string; path?: string; literal?: boolean }) {
  let capturedTool: any = null;
  const mockPi = { registerTool(def: any) { capturedTool = def; } };
  registerGrepTool(mockPi as any);
  return capturedTool.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getText(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });

  // #045: NUL-free binary (Mach-O / random high-bit bytes, no NUL)
  writeFileSync(join(tmpDir, "no-nul.bin"), Buffer.from([0x83, 0xc8, 0x1d, 0x9f, 0x5f, 0x12, 0x1c, 0x26, 0x38, 0xe8, 0x95, 0x05, 0x63, 0xdc, 0x68, 0xb1]));

  // #045: File with only high-bit bytes (no NUL) — typical for binary segments
  writeFileSync(join(tmpDir, "high-bit.bin"), Buffer.from(Array.from({ length: 10 }, (_, i) => 246 + i)));

  // #046: Bare-CR file (classic Mac line endings — rg treats as 1 line, read normalizes to N)
  writeFileSync(join(tmpDir, "cr-only.txt"), Buffer.from("line1\rline2\rline3\r"));

  // #047: Non-NUL binary with embedded ASCII "NEEDLE"
  writeFileSync(
    join(tmpDir, "binary-needle.bin"),
    Buffer.concat([Buffer.from([0xff, 0xfe, 0xfd, 0xfc]), Buffer.from("NEEDLE"), Buffer.from([0xfb, 0xfa, 0xf9])]),
  );
});

afterAll(() => {
  try { rmSync(tmpDir, { recursive: true }); } catch {}
});

// ─── Issue #045: Binary detection only checks NUL bytes ─────────────────────

describe("Issue #045: binary detection misses NUL-free binary files", () => {
  it("sample.bin (existing fixture, no NUL) should warn about binary content", async () => {
    // tests/fixtures/sample.bin is a 16-byte binary with NO NUL bytes
    // Current code: rawBuffer.includes(0) → false → no warning → garbled output
    const result = await callReadTool({ path: "tests/fixtures/sample.bin" });
    const output = getText(result);

    // FAILS: output does NOT contain a binary warning — it just returns garbled hashlines
    expect(output).toContain("[Warning: file appears to be binary");
  });

  it("NUL-free high-bit bytes file should warn about binary content", async () => {
    // File: 10 bytes from 0xf6..0xff — clearly binary, no NUL
    // Current code: rawBuffer.includes(0) → false → no warning
    const result = await callReadTool({ path: join(tmpDir, "high-bit.bin") });
    const output = getText(result);

    // FAILS: no warning emitted for NUL-free binary
    expect(output).toContain("[Warning: file appears to be binary");
  });

  it("file WITH NUL bytes correctly gets binary warning (regression guard)", async () => {
    // Control: file that DOES have NUL — this currently works and must keep working
    const nulFile = join(tmpDir, "has-nul.bin");
    writeFileSync(nulFile, Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f])); // "hello\0wo"
    const result = await callReadTool({ path: nulFile });
    const output = getText(result);

    // PASSES: this currently works
    expect(output).toContain("[Warning: file appears to be binary");
  });
});

// ─── Issue #046: Grep anchors wrong on bare-CR files ─────────────────────────

describe("Issue #046: grep anchors/snippets wrong on bare-CR files", () => {
  it("grep reports line2 at line 2 in bare-CR file", async () => {
    // File: "line1\rline2\rline3\r" — read normalizes to 3 lines
    // rg sees NO \n, treats entire content as line 1 → reports match at line 1
    // grep.ts passes through rg's line 1 → anchor says 1:XX
    // But read tool shows line2 at line 2 → anchor mismatch
    const result = await callGrepTool({ pattern: "line2", path: join(tmpDir, "cr-only.txt") });
    const output = getText(result);

    // FAILS: output contains ">>1:" (line 1 anchor) instead of ">>2:" (line 2)
    expect(output).toContain(">>2:");
    expect(output).not.toContain(">>1:");
  });

  it("ripgrep raw behavior: bare-CR file is treated as single line by rg", () => {
    // Directly verify rg's behavior — it reports line 1 for the whole bare-CR file
    let rawOutput: Buffer;
    try {
      rawOutput = execFileSync("rg", ["--line-number", "line2", join(tmpDir, "cr-only.txt")]);
    } catch (e: any) {
      rawOutput = e.stdout ?? Buffer.alloc(0);
    }
    const text = rawOutput.toString("binary"); // raw, no CR→LF translation
    // rg outputs "1:line1\rline2\rline3\r\n" — everything on line 1 because no \n in file
    expect(text).toMatch(/^1:/); // entire file is "line 1" to rg
  });

  it("read tool shows line2 at line 2 (confirms mismatch with grep anchor)", async () => {
    // read normalizes \r → \n, so "line2" appears at line 2
    const result = await callReadTool({ path: join(tmpDir, "cr-only.txt") });
    const output = getText(result);
    // Find the hashline for line 2 containing "line2"
    const lines = output.split("\n");
    const line2Entry = lines.find((l) => l.startsWith("2:") && l.includes("line2"));
    expect(line2Entry).toBeTruthy(); // read shows line2 at line 2
  });
});

// ─── Issue #047: Grep silently 0 matches on non-NUL binary with ASCII ────────

describe("Issue #047: grep silently returns 0 matches on non-NUL binary with ASCII", () => {
  it("grep on binary-needle.bin returns 0 matches with no warning", async () => {
    // File has no NUL → grep.ts binary check (buf.includes(0)) → false → no warning
    // rg detects non-UTF8, silently skips → 0 results
    // Expected fix: warn user about binary skip OR search raw bytes
    const result = await callGrepTool({ pattern: "NEEDLE", path: join(tmpDir, "binary-needle.bin"), literal: true });
    const output = getText(result);

    // FAILS: output is "[0 matches in 0 files]" with no binary warning
    // After fix: should warn OR find the match
    expect(output.toLowerCase()).toMatch(/binary|warning|skipped/);
  });

  it("NUL-containing binary file correctly warns (regression guard)", async () => {
    // Control: file with NUL — the existing binary warning path works
    const nulFile = join(tmpDir, "has-nul.bin");
    writeFileSync(nulFile, Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x77, 0x6f])); // "hello\0wo"
    const result = await callGrepTool({ pattern: "hello", path: nulFile, literal: true });
    const output = getText(result);

    // PASSES: existing NUL path fires warning
    expect(output.toLowerCase()).toMatch(/binary|warning/);
  });

  it("ripgrep raw behavior: non-NUL binary silently exits 1 with no output", () => {
    // Directly verify rg silently returns no match for non-UTF8 non-NUL binary
    let rawStdout = "";
    let rawStderr = "";
    try {
      rawStdout = execFileSync("rg", ["--line-number", "NEEDLE", join(tmpDir, "binary-needle.bin")], { encoding: "utf8" });
    } catch (e: any) {
      rawStdout = e.stdout ?? "";
      rawStderr = e.stderr ?? "";
    }
    // rg produces no stdout, no stderr, exit 1 — completely silent skip
    expect(rawStdout).toBe("");
    expect(rawStderr).toBe("");
  });
});

// ─── Issue #048: .js specifiers block node --experimental-strip-types ─────────

describe("Issue #048: .js import specifiers block node --experimental-strip-types", () => {
  it("bash-filter.ts loads successfully via node --experimental-strip-types", () => {
    // After fix: .ts specifiers resolve correctly — no ERR_MODULE_NOT_FOUND
    let error: Error | null = null;
    let stdout = "";
    try {
      stdout = execFileSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--input-type=module",
          "-e",
          "import * as m from './src/rtk/bash-filter.ts'; console.log(Object.keys(m).join(','));",
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
    } catch (e: any) {
      error = e;
    }
    expect(error).toBeNull();
    expect(stdout).toContain("filterBashOutput");
  });

  it(".ts specifiers are used in rtk source files (no .js imports)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const bashFilterSrc = readFileSync(
      join(process.cwd(), "src/rtk/bash-filter.ts"),
      "utf8",
    );
    // After fix: .js specifiers gone, .ts specifiers present
    expect(bashFilterSrc).not.toMatch(/from "\.\/.*\.js"/);
    expect(bashFilterSrc).toMatch(/from "\.\/.*\.ts"/);
  });
});
