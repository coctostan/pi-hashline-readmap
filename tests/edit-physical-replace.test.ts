import { expect, it } from "vitest";

it("replaces mapped physical spans with literal payloads", async () => {
  const path = "../src/edit-diff.js";
  const module: any = await import(path);
  expect(typeof module.replacePhysicalText === "function").toBe(true);
  expect(typeof module.findPhysicalTextSpans === "function").toBe(true);
  const fixtures = [
    { input: "head\nold\r\nline\nlast\r\n", old: "old\r\nline", next: "new\r\nline", opts: {}, output: "head\nnew\r\nline\nlast\r\n", count: 1, fuzzy: false },
    { input: "a\r\nb", old: "a\nb", next: "A\nb", opts: {}, output: "A\nb", count: 1, fuzzy: false },
    { input: "a\nb", old: "a\r\nb", next: "A\r\nb", opts: {}, output: "A\r\nb", count: 1, fuzzy: false },
    { input: "old\nline|old\r\nline", old: "old\r\nline", next: "NEW", opts: { all: true }, output: "old\nline|NEW", count: 1, fuzzy: false },
    { input: "old\r\nline|old\r\nline\n", old: "old\nline", next: "new\nline", opts: { all: true }, output: "new\nline|new\nline\n", count: 2, fuzzy: false },
    { input: "head\r\na   b\na\tb\r\n", old: "a b", next: "X\r\nY", opts: { all: true, fuzzy: true }, output: "head\r\nX\r\nY\nX\r\nY\r\n", count: 2, fuzzy: true },
    { input: "a\nb", old: "a\rb", next: "X", opts: { fuzzy: true }, output: "X", count: 1, fuzzy: true },
    { input: "a\nb", old: "a\rb", next: "X", opts: {}, output: "a\nb", count: 0, fuzzy: false },
    { input: "a\nb", old: "a\nb", next: "a\r\nb", opts: {}, output: "a\r\nb", count: 1, fuzzy: false },
    { input: "untouched\r\n", old: "", next: "X", opts: { all: true, fuzzy: true }, output: "untouched\r\n", count: 0, fuzzy: false },
  ];
  for (const fixture of fixtures) {
    const result = module.replacePhysicalText(fixture.input, fixture.old, fixture.next, fixture.opts);
    expect(result.content === fixture.output && result.count === fixture.count && result.usedFuzzyMatch === fixture.fuzzy).toBe(true);
  }
  expect(module.findPhysicalTextSpans("a\r\nb|a\r\nb", "a\nb")).toEqual([{ index: 0, matchLength: 4 }, { index: 5, matchLength: 4 }]);

  expect(module.findFuzzyTextSpans("a   b\na\tb\r\n", "a b", true)).toEqual([
    { index: 0, matchLength: 5 }, { index: 6, matchLength: 3 },
  ]);
  expect(module.replacePhysicalText("prefix\t  alpha   \t suffix", "\nalpha\n", "X\r\nY", { fuzzy: true })).toEqual({
    content: "prefixX\r\nYsuffix", count: 1, usedFuzzyMatch: true,
  });
  expect(module.replacePhysicalText("“alpha”\n“alpha”\r\n", '"alpha"', "X\r\nY", { fuzzy: true, all: true })).toEqual({
    content: "X\r\nY\nX\r\nY\r\n", count: 2, usedFuzzyMatch: true,
  });
  for (const count of [1000, 4000, 8000]) {
    const input = "keep\r\n" + "a   b\n".repeat(count) + "tail\r\n";
    const start = performance.now();
    const physical = module.replacePhysicalText(input, "a b", "X\r\nY", { all: true, fuzzy: true });
    const physicalMs = performance.now() - start;
    const baselineStart = performance.now();
    const baseline = module.replaceText(input, "a b", "X\r\nY", { all: true, fuzzy: true });
    const baselineMs = performance.now() - baselineStart;
    expect(physical.content === "keep\r\n" + "X\r\nY\n".repeat(count) + "tail\r\n").toBe(true);
    expect(physical.count === count && physical.usedFuzzyMatch).toBe(true);
    expect(module.normalizeToLF(physical.content)).toBe(module.normalizeToLF(baseline.content));
    console.info(JSON.stringify({ verification: "exported all-fuzzy", count, physicalMs, baselineMs }));
  }
});
