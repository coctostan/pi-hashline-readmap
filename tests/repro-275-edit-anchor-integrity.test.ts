import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { ServedLines } from "../src/served-lines.js";

const ref = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;

function setup(original: string) {
  const cwd = mkdtempSync(resolve(tmpdir(), "pi-repro-275-"));
  const path = resolve(cwd, "sample.txt");
  writeFileSync(path, original, "utf8");
  // Simulate a complete read of the file: every row was served to the model.
  const served = new ServedLines();
  served.record(path, original.split("\n").map((raw, i) => ({ line: i + 1, hash: computeLineHash(i + 1, raw) })), true);
  const tool: any = registerEditTool({ registerTool() {} } as any, { served, wasReadInSession: () => true });
  const run = (edits: unknown[]) => tool.execute("repro-275", { path, edits }, undefined, undefined, { cwd } as any);
  return { cwd, path, run };
}

beforeAll(async () => {
  await ensureHashInit();
});

describe("issue 270 — new_text prefixes silently stripped", () => {
  const cases: Array<[string, string]> = [
    ["LINE:HASH-like (time)", "12:30|meeting"],
    ["LINE:HASH-like (pi)", "3:14|pi"],
    ["LINE:HASH-like non-hex", "1:xyz|x"],
    ["bare HASH| multi-line", "abc|def\nfed|cba"],
    ["bare digits| multi-line", "123|456\n789|012"],
    ["markdown + list", "+ item one\n+ item two"],
    ["+N lines", "+1\n+2\n+3"],
    ["50% plus rule", "a\n+b"],
  ];

  for (const [label, newText] of cases) {
    it(`preserves new_text verbatim: ${label}`, async () => {
      const { cwd, path, run } = setup("original");
      try {
        const result = await run([{ set_line: { anchor: ref(1, "original"), new_text: newText } }]);
        expect(result.isError).toBeFalsy();
        expect(readFileSync(path, "utf8")).toBe(newText);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    });
  }
});

describe("issue 271 — stale anchor after line-shifting edit hits the wrong line", () => {
  it("does not silently apply a pre-shift anchor to a different line with the same hash", async () => {
    const original = "a\n}\n}\nb";
    const { cwd, path, run } = setup(original);
    try {
      // Anchors from the initial read.
      const aRef = ref(1, "a"); // 1:456
      const secondBraceRef = ref(3, "}"); // 3:b18 — the caller means the SECOND brace

      const first = await run([{ insert_after: { anchor: aRef, new_text: "x" } }]);
      expect(first.isError).toBeFalsy();
      expect(readFileSync(path, "utf8")).toBe("a\nx\n}\n}\nb");

      // Reuse the stale anchor from the earlier read.
      const second = await run([{ set_line: { anchor: secondBraceRef, new_text: "SECOND_BRACE_EDIT" } }]);
      const after = readFileSync(path, "utf8");

      // Acceptable outcomes: refuse (stale anchor) without writing, or edit the intended (second) brace.
      if (second.isError) {
        expect(after).toBe("a\nx\n}\n}\nb");
      } else {
        expect(after).toBe("a\nx\n}\nSECOND_BRACE_EDIT\nb");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
