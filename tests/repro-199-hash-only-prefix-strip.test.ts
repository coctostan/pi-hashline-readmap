import { describe, it, expect, beforeAll } from "vitest";
import { ensureHashInit, applyHashlineEdits, computeLineHash } from "../src/hashline.js";

describe("repro 199 — hash-only prefixes are stripped from new_text", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("strips dominant hash-only prefixes (033|, d05|) in set_line new_text", () => {
    const orig = ["alpha", "beta", "gamma"].join("\n");
    const anchor = `2:${computeLineHash(2, "beta")}`;
    const res = applyHashlineEdits(
      orig,
      [{ set_line: { anchor, new_text: "033|beta-modified\nd05|extra-line" } }],
      new AbortController().signal,
    );
    expect(res.content.split("\n")).toEqual(["alpha", "beta-modified", "extra-line", "gamma"]);
  });

  it("strips dominant hash-only prefixes in replace_lines new_text", () => {
    const orig = ["alpha", "beta", "gamma"].join("\n");
    const start = `1:${computeLineHash(1, "alpha")}`;
    const end = `2:${computeLineHash(2, "beta")}`;
    const res = applyHashlineEdits(
      orig,
      [{ replace_lines: { start_anchor: start, end_anchor: end, new_text: "abc|one\ndef|two" } }],
      new AbortController().signal,
    );
    expect(res.content.split("\n")).toEqual(["one", "two", "gamma"]);
  });

  it("preserves a single legitimate pipe-prefixed line (no false-positive strip)", () => {
    const orig = ["alpha", "beta", "gamma"].join("\n");
    const anchor = `2:${computeLineHash(2, "beta")}`;
    const res = applyHashlineEdits(
      orig,
      [{ set_line: { anchor, new_text: "abc|payload" } }],
      new AbortController().signal,
    );
    expect(res.content.split("\n")).toEqual(["alpha", "abc|payload", "gamma"]);
  });
});
