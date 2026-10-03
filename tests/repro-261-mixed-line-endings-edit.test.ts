import { beforeAll, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { registerEditTool } from "../src/edit.js";
import { computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(async () => { await ensureHashInit(); });
const ref = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;
interface Fixture {
  name: string;
  original: string;
  expected: string;
  oldText?: string;
  newText?: string;
  anchorEdits?: () => unknown[];
  all?: boolean;
  fuzzy?: boolean;
}
async function assertPhysicalCandidate(fixture: Fixture): Promise<void> {
  const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-261-"));
  try {
    const path = resolve(cwd, "sample.txt");
    writeFileSync(path, fixture.original);
    const tool: any = registerEditTool({ registerTool() {} } as any, { wasReadInSession: () => true });
    const edits = fixture.anchorEdits?.() ?? (fixture.oldText === undefined
      ? [{ set_line: { anchor: ref(1, "alpha"), new_text: "ALPHA" } }]
      : [{ replace: { old_text: fixture.oldText, new_text: fixture.newText, all: fixture.all ?? false, fuzzy: fixture.fuzzy ?? false } }]);
    const result = await tool.execute("261", { path, edits, postEditVerify: true }, undefined, undefined, { cwd } as any);
    expect(result.isError).toBeUndefined();
    expect(result.details?.ptcValue?.ok).toBe(true);
    expect(readFileSync(path).equals(Buffer.from(fixture.expected))).toBe(true);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}
const originalCases: Fixture[] = [
  { name: "literal ASCII, LF first", original: "// Keep this comment unchanged.\nold\r\nline\n", oldText: "old\r\nline", newText: "new\r\nline", expected: "// Keep this comment unchanged.\nnew\r\nline\n" },
  { name: "literal Unicode, LF first", original: "// Keep café 😀 unchanged.\nold café\r\nline 😀\n", oldText: "old café\r\nline 😀", newText: "new café\r\nline 😀", expected: "// Keep café 😀 unchanged.\nnew café\r\nline 😀\n" },
  { name: "literal ASCII, CRLF first", original: "// Keep this comment unchanged.\r\nold\nline\r\n", oldText: "old\nline", newText: "new\nline", expected: "// Keep this comment unchanged.\r\nnew\nline\r\n" },
  { name: "anchored unrelated separator", original: "alpha\nbeta\r\ngamma\n", expected: "ALPHA\nbeta\r\ngamma\n" },
  { name: "uniform LF control", original: "// Keep this comment unchanged.\nold\nline\n", oldText: "old\nline", newText: "new\nline", expected: "// Keep this comment unchanged.\nnew\nline\n" },
  { name: "uniform CRLF control", original: "// Keep this comment unchanged.\r\nold\r\nline\r\n", oldText: "old\r\nline", newText: "new\r\nline", expected: "// Keep this comment unchanged.\r\nnew\r\nline\r\n" },
];
it.each(originalCases)("original reproduction: $name", assertPhysicalCandidate);

const preservationCases: Fixture[] = [
  { name: "BOM without final newline", original: "\uFEFFhead\nold\r\nline", oldText: "old\r\nline", newText: "new\r\nline", expected: "\uFEFFhead\nnew\r\nline" },
  { name: "separator-only literal mutation", original: "a\nb\r\n", oldText: "a\nb", newText: "a\r\nb", expected: "a\r\nb\r\n" },
  { name: "LF needle against CRLF", original: "a\r\nb", oldText: "a\nb", newText: "A\nb", expected: "A\nb" },
  { name: "CRLF needle against LF", original: "a\nb", oldText: "a\r\nb", newText: "A\r\nb", expected: "A\r\nb" },
  { name: "anchored insertion payload", original: "a\nb\r\nc\n", anchorEdits: () => [{ insert_after: { anchor: ref(1, "a"), new_text: "X\r\nY\r\n" } }], expected: "a\nX\nY\nb\r\nc\n" },
  { name: "anchored range replacement", original: "a\r\nb\nc\r\nd\n", anchorEdits: () => [{ replace_lines: { start_anchor: ref(2, "b"), end_anchor: ref(3, "c"), new_text: "X\nY" } }], expected: "a\r\nX\nY\r\nd\n" },
  { name: "anchored range deletion", original: "a\nb\r\nc\nd\r\n", anchorEdits: () => [{ replace_lines: { start_anchor: ref(2, "b"), end_anchor: ref(3, "c"), new_text: "" } }], expected: "a\nd\r\n" },
  { name: "EOF insertion without terminator", original: "a\r\nb", anchorEdits: () => [{ insert_after: { anchor: ref(2, "b"), new_text: "X" } }], expected: "a\r\nb\r\nX" },
  { name: "same-anchor request ordering", original: "head\nlast\r\n", anchorEdits: () => [{ insert_after: { anchor: ref(1, "head"), new_text: "first" } }, { insert_after: { anchor: ref(1, "head"), new_text: "second" } }], expected: "head\nfirst\nsecond\nlast\r\n" },
  { name: "relocated anchor", original: "prefix\na\r\nb\n", anchorEdits: () => [{ set_line: { anchor: ref(1, "a"), new_text: "A" } }], expected: "prefix\nA\r\nb\n" },
  { name: "repeated identical rows", original: "same\nsame\r\nsame\n", anchorEdits: () => [{ set_line: { anchor: ref(2, "same"), new_text: "NEW" } }], expected: "same\nNEW\r\nsame\n" },
  { name: "empty-file sentinel", original: "", anchorEdits: () => [{ insert_after: { anchor: ref(1, ""), new_text: "A\nB" } }], expected: "A\nB" },
  { name: "terminator anchor", original: "aaa\n", anchorEdits: () => [{ insert_after: { anchor: ref(2, ""), new_text: "X" } }], expected: "aaa\nX\n" },
  { name: "physical no-op", original: "a\nb\r\n", oldText: "a\nb", newText: "a\nb", expected: "a\nb\r\n" },
  { name: "literal all occurrences", original: "old\r\nline|old\r\nline\n", oldText: "old\r\nline", newText: "new\nline", all: true, expected: "new\nline|new\nline\n" },
  { name: "fuzzy all mixed separators", original: "keep\na   b\na\tb\r\ntail", oldText: "a b", newText: "X\r\nY", all: true, fuzzy: true, expected: "keep\nX\r\nY\nX\r\nY\r\ntail" },
  { name: "unique byte-exact tier", original: "head\nold\nline|old\r\nline\n", oldText: "old\r\nline", newText: "NEW\r\nLINE", expected: "head\nold\nline|NEW\r\nLINE\n" },
];
it.each(preservationCases)("physical preservation: $name", assertPhysicalCandidate);

it("physical preservation: many all-fuzzy matches retain literal CRLF payloads", async () => {
  const repeats = 256;
  const start = performance.now();
  await assertPhysicalCandidate({
    name: "many fuzzy spans",
    original: "keep\r\n" + "a   b\na\tb\r\n".repeat(repeats) + "tail\n",
    oldText: "a b", newText: "X\r\nY", all: true, fuzzy: true,
    expected: "keep\r\n" + "X\r\nY\nX\r\nY\r\n".repeat(repeats) + "tail\n",
  });
  console.info(JSON.stringify({ verification: "tool all-fuzzy", matches: repeats * 2, milliseconds: performance.now() - start }));
});

const ambiguousCases = [
  { name: "duplicate byte-exact tier ignores LF equivalent", original: "old\nline|old\r\nline|old\r\nline\n", oldText: "old\r\nline", count: 2 },
  { name: "duplicate equivalent tier maps physical rows", original: "head\r\nold\r\nline|old\r\nline\r\n", oldText: "old\nline", count: 2 },
  { name: "large ambiguity returns feedback, not RangeError", original: "a\n".repeat(200000), oldText: "a", count: 200000 },
];
it.each(ambiguousCases)("ambiguity safety: $name", async (fixture) => {
  const cwd = mkdtempSync(resolve(tmpdir(), "pi-edit-261-ambiguity-"));
  try {
    const path = resolve(cwd, "sample.txt");
    writeFileSync(path, fixture.original);
    const tool: any = registerEditTool({ registerTool() {} } as any);
    const result = await tool.execute("261-ambiguity", {
      path, edits: [{ replace: { old_text: fixture.oldText, new_text: "NEW\r\nLINE" } }], postEditVerify: true,
    }, undefined, undefined, { cwd } as any);
    expect(result.isError).toBe(true);
    expect(result.details?.ptcValue?.error?.code).toBe("ambiguous-match");
    expect(result.content[0].text).toContain(`occurs ${fixture.count} times`);
    const rows = result.details.ptcValue.error.details.updatedAnchors;
    expect(rows.length > 0 && rows.length <= 10).toBe(true);
    expect(rows.every((row: any) => row.raw === undefined || !row.raw.includes("\r"))).toBe(true);
    expect(readFileSync(path).equals(Buffer.from(fixture.original))).toBe(true);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
