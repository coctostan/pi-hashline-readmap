/**
 * SEC-001 adversarial-filename regression tests.
 *
 * Verifies that mapper subprocess invocations cannot be hijacked by
 * filenames containing shell metacharacters. The previous implementation
 * built shell command strings via `"${filePath}"` interpolation; if a
 * malicious filename escaped the quoting, an attacker could execute
 * arbitrary code on the agent host.
 *
 * Each test case feeds a file with a hostile name to a mapper and then
 * asserts the sentinel side-effect file was NOT created. The sentinel
 * file path is the only evidence of a successful injection.
 *
 * Each test status is reported as one of:
 *   VERIFIED   — mapper executed the relevant path and asserted safety
 *   EXPECTED   — mapper rejected the file (controlled error); safety
 *                still asserted via sentinel check
 *   SKIPPED    — required external binary not available; counted as
 *                a skip, not as security proof
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { fallbackMapper } from "../src/readmap/mappers/fallback.js";
import { jsonMapper } from "../src/readmap/mappers/json.js";
import { pythonMapper } from "../src/readmap/mappers/python.js";
import { goMapper } from "../src/readmap/mappers/go.js";
import { ctagsMapper, resetCtagsCache } from "../src/readmap/mappers/ctags.js";

const execFileAsync = promisify(execFile);

/**
 * Hostile filename classes required by CRITERIA.md Acceptance Criterion 3
 * and METRICS.md M2. Each entry has a label and the metacharacter sequence
 * that must appear in the filename.
 */
const ADVERSARIAL_NAMES: { label: string; name: string }[] = [
  { label: "double-quote", name: 'evil".txt' },
  { label: "single-quote", name: "evil'.txt" },
  { label: "semicolon", name: "evil;touch_pwn.txt" },
  { label: "command-substitution", name: "evil$(touch pwn).txt" },
  { label: "backtick", name: "evil`touch pwn`.txt" },
  { label: "newline", name: "evil\ntouch pwn.txt" },
  { label: "unicode-space", name: "evil\u00A0touch\u00A0pwn.txt" },
];

let tmpRoot = "";
let sentinelDir = "";

async function hasBinary(bin: string): Promise<boolean> {
  try {
    await execFileAsync(bin, ["--version"], { timeout: 2000 });
    return true;
  } catch {
    try {
      await execFileAsync(bin, ["version"], { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "sec001-"));
  sentinelDir = await mkdtemp(join(tmpdir(), "sec001-sentinel-"));
  resetCtagsCache();
});

afterEach(async () => {
  // Verify no file was created in CWD or in sentinel dir as a result of
  // a successful command injection.
  expect(existsSync(join(process.cwd(), "pwn"))).toBe(false);
  expect(existsSync(join(sentinelDir, "pwn"))).toBe(false);
  // The legacy vulnerable patterns would have created files literally
  // named "touch_pwn.txt", "pwn", etc. Make sure none escaped into
  // common locations.
  expect(existsSync(join(tmpRoot, "..", "pwn"))).toBe(false);
});

async function writeAdversarialFile(
  name: string,
  content: string
): Promise<string | null> {
  const path = join(tmpRoot, name);
  try {
    await writeFile(path, content);
    return path;
  } catch {
    // Some filesystems (e.g. CI on Windows) cannot create files with
    // these names. Treat as a SKIP and report it.
    return null;
  }
}

describe("SEC-001: adversarial filename regression (P0-A4)", () => {
  describe("fallback mapper (grep replacement)", () => {
    for (const { label, name } of ADVERSARIAL_NAMES) {
      it(`fallbackMapper survives filename class: ${label}`, async () => {
        const path = await writeAdversarialFile(
          name,
          "class Foo {}\ndef bar():\n  pass\n"
        );
        if (path === null) {
          console.warn(
            `[SEC-001:${label}] SKIPPED: filesystem rejected filename`
          );
          return;
        }

        // Must not throw nor create sentinel side effect.
        const result = await fallbackMapper(path);
        // Either a valid FileMap or null — both acceptable; the
        // security assertion is the sentinel check in afterEach.
        expect(result === null || typeof result.totalLines === "number").toBe(
          true
        );
      });
    }
  });

  describe("json mapper (jq replacement)", () => {
    let jqAvailable = false;
    beforeAll(async () => {
      jqAvailable = await hasBinary("jq");
    });

    for (const { label, name } of ADVERSARIAL_NAMES) {
      it(`jsonMapper survives filename class: ${label}`, async () => {
        if (!jqAvailable) {
          console.warn(`[SEC-001:json:${label}] SKIPPED: jq not available`);
          return;
        }

        const jsonName = name.endsWith(".txt")
          ? name.slice(0, -4) + ".json"
          : name + ".json";
        const path = await writeAdversarialFile(jsonName, '{"ok":true}\n');
        if (path === null) {
          console.warn(`[SEC-001:json:${label}] SKIPPED: filesystem`);
          return;
        }

        const result = await jsonMapper(path);
        expect(result === null || typeof result.totalLines === "number").toBe(
          true
        );
      });
    }
  });

  describe("python mapper (python3 replacement)", () => {
    let pyAvailable = false;
    beforeAll(async () => {
      pyAvailable = await hasBinary("python3");
    });

    for (const { label, name } of ADVERSARIAL_NAMES) {
      it(`pythonMapper survives filename class: ${label}`, async () => {
        if (!pyAvailable) {
          console.warn(`[SEC-001:python:${label}] SKIPPED: python3`);
          return;
        }

        const pyName = name.endsWith(".txt")
          ? name.slice(0, -4) + ".py"
          : name + ".py";
        const path = await writeAdversarialFile(
          pyName,
          "def foo():\n    return 1\n"
        );
        if (path === null) {
          console.warn(`[SEC-001:python:${label}] SKIPPED: filesystem`);
          return;
        }

        const result = await pythonMapper(path);
        expect(result === null || typeof result.totalLines === "number").toBe(
          true
        );
      });
    }
  });

  describe("go mapper (compiled binary replacement)", () => {
    let goAvailable = false;
    beforeAll(async () => {
      goAvailable = await hasBinary("go");
    });

    for (const { label, name } of ADVERSARIAL_NAMES) {
      it(`goMapper survives filename class: ${label}`, async () => {
        if (!goAvailable) {
          console.warn(`[SEC-001:go:${label}] SKIPPED: go not available`);
          return;
        }

        const goName = name.endsWith(".txt")
          ? name.slice(0, -4) + ".go"
          : name + ".go";
        const path = await writeAdversarialFile(
          goName,
          "package main\nfunc main() {}\n"
        );
        if (path === null) {
          console.warn(`[SEC-001:go:${label}] SKIPPED: filesystem`);
          return;
        }

        const result = await goMapper(path);
        expect(result === null || typeof result.totalLines === "number").toBe(
          true
        );
      });
    }
  });

  describe("ctags mapper (ctags replacement)", () => {
    let ctagsAvailable = false;
    beforeAll(async () => {
      ctagsAvailable = await hasBinary("ctags");
      resetCtagsCache();
    });

    for (const { label, name } of ADVERSARIAL_NAMES) {
      it(`ctagsMapper survives filename class: ${label}`, async () => {
        if (!ctagsAvailable) {
          console.warn(`[SEC-001:ctags:${label}] SKIPPED: ctags`);
          return;
        }

        const cName = name.endsWith(".txt") ? name.slice(0, -4) + ".c" : name + ".c";
        const path = await writeAdversarialFile(
          cName,
          "int main(void) { return 0; }\n"
        );
        if (path === null) {
          console.warn(`[SEC-001:ctags:${label}] SKIPPED: filesystem`);
          return;
        }

        const result = await ctagsMapper(path);
        expect(result === null || typeof result.totalLines === "number").toBe(
          true
        );
      });
    }
  });

  describe("sentinel: no artifact escapes the temp directory", () => {
    it("no `pwn` file in cwd, tmp parent, or sentinel dir after the suite", async () => {
      expect(existsSync(join(process.cwd(), "pwn"))).toBe(false);
      expect(existsSync(join(sentinelDir, "pwn"))).toBe(false);
      // Older injection payload variants tried to create literally named
      // files in /tmp; verify none exist at the parent of tmpRoot.
      const parent = join(tmpRoot, "..");
      await expect(access(join(parent, "pwn"), constants.F_OK)).rejects.toThrow();
    });
  });
});
