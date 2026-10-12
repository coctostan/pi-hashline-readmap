import { beforeAll, describe, expect, it } from "vitest";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";
import { buildReadWindowOutput } from "../src/read-output.js";

beforeAll(async () => {
  await ensureHashInit();
});

const base = { path: "/tmp/long.txt", line: 5, totalLines: 9 };

describe("buildReadWindowOutput", () => {
  it("starts with the full-line anchor and the first window slice", () => {
    const raw = "x".repeat(1200);
    const out = buildReadWindowOutput({ ...base, raw, charOffset: 0, charLimit: 500 });
    expect(out.text.split("\n")[0]).toBe(`5:${computeLineHash(5, raw)}|${"x".repeat(500)}`);
  });

  it("appends a notice with the span, remaining chars and a runnable continuation", () => {
    const out = buildReadWindowOutput({ ...base, raw: "x".repeat(1200), charOffset: 0, charLimit: 500 });
    expect(out.text.split("\n").slice(1)).toEqual([
      "",
      '[Showing chars 0-500 of 1200 on line 5 (700 remaining). Continue with read({ path: "/tmp/long.txt", offset: 5, charOffset: 500 }).]',
    ]);
  });

  it("adds charLimit to the continuation only when it is not the default", () => {
    const out = buildReadWindowOutput({ ...base, raw: "x".repeat(1200), charOffset: 0, charLimit: 1000 });
    expect(out.text).toContain('read({ path: "/tmp/long.txt", offset: 5, charOffset: 1000, charLimit: 1000 }).]');
  });

  it("says end of line and offers no continuation at the tail", () => {
    const out = buildReadWindowOutput({ ...base, raw: "x".repeat(1200), charOffset: 1000, charLimit: 500 });
    expect(out.text.split("\n")[0]).toBe(`5:${computeLineHash(5, "x".repeat(1200))}|${"x".repeat(200)}`);
    expect(out.text).toContain("[Showing chars 1000-1200 of 1200 on line 5 (end of line).]");
    expect(out.text).not.toContain("Continue with");
  });

  it("measures offsets and totals on the escaped display string", () => {
    const raw = "a\u0001b"; // displays as a\u0001b (8 chars)
    const out = buildReadWindowOutput({ ...base, raw, charOffset: 1, charLimit: 6 });
    expect(out.text.split("\n")[0]).toBe(`5:${computeLineHash(5, raw)}|\\u0001`);
    expect(out.text).toContain("[Showing chars 1-7 of 8 on line 5 (1 remaining).");
    expect(out.window).toMatchObject({ start: 1, end: 7, total: 8, remaining: 1, nextCharOffset: 7 });
  });
});
