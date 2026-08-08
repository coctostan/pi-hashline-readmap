import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { replaceText } from "../src/edit-diff.js";
import { registerEditTool } from "../src/edit.js";
import { buildPendingEditPreviewData } from "../src/pending-diff-preview.js";

async function callEditTool(params: Record<string, unknown>) {
  let tool: any;
  registerEditTool({ registerTool(def: any) { tool = def; } } as any);
  return tool.execute("repro-241", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("repro 241: fuzzy replace whitespace normalization", () => {
  it.each([
    {
      name: "single replacement across repeated spaces",
      input: "label = alpha   beta\n",
      oldText: "alpha beta",
      newText: "omega",
      all: false,
      expected: "label = omega\n",
      expectFuzzy: true,
    },
    {
      name: "all:true replacement across spaces and tabs",
      input: "label = alpha   beta\nlabel = alpha\tbeta\n",
      oldText: "alpha beta",
      newText: "omega",
      all: true,
      expected: "label = omega\nlabel = omega\n",
      expectFuzzy: true,
    },
    {
      name: "configured Unicode spaces",
      input: "label = alpha\u00a0\u2002beta\n",
      oldText: "alpha beta",
      newText: "omega",
      all: false,
      expected: "label = omega\n",
      expectFuzzy: true,
    },
    {
      name: "CRLF old_text against LF content",
      input: "label = alpha\nbeta\n",
      oldText: "alpha\r\nbeta",
      newText: "omega",
      all: false,
      expected: "label = omega\n",
      expectFuzzy: true,
    },
    {
      name: "bare-CR old_text against LF content",
      input: "label = alpha\nbeta\n",
      oldText: "alpha\rbeta",
      newText: "omega",
      all: false,
      expected: "label = omega\n",
      expectFuzzy: true,
    },
    {
      name: "confusable hyphen",
      input: "label = alpha—beta\n",
      oldText: "alpha-beta",
      newText: "omega",
      all: false,
      expected: "label = omega\n",
      expectFuzzy: true,
    },
    {
      name: "all:true configured Unicode spaces",
      input: "alpha\u00a0beta\nalpha\u2002beta\n",
      oldText: "alpha beta",
      newText: "omega",
      all: true,
      expected: "omega\nomega\n",
      expectFuzzy: true,
    },
    {
      name: "all:true CRLF old_text against LF content",
      input: "alpha\nbeta|alpha\nbeta\n",
      oldText: "alpha\r\nbeta",
      newText: "omega",
      all: true,
      expected: "omega|omega\n",
      expectFuzzy: true,
    },
    {
      name: "confusable smart quotes",
      input: "label = “alpha”\n",
      oldText: "\"alpha\"",
      newText: "omega",
      all: false,
      expected: "label = omega\n",
      expectFuzzy: true,
    },
    {
      name: "exact match precedence",
      input: "label = alpha beta\n",
      oldText: "alpha beta",
      newText: "omega",
      all: false,
      expected: "label = omega\n",
      expectFuzzy: false,
    },
  ])("normalizes $name", async ({ input, oldText, newText, all, expected, expectFuzzy }) => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-repro-241-"));
    const filePath = resolve(dir, "sample.txt");
    writeFileSync(filePath, input, "utf8");

    const params = {
      path: filePath,
      edits: [{ replace: { old_text: oldText, new_text: newText, fuzzy: true, all } }],
    };
    const preview = await buildPendingEditPreviewData(params, dir);
    const result = await callEditTool(params);

    expect.soft(result.details?.ptcValue?.error).toBeUndefined();
    expect.soft(readFileSync(filePath, "utf8")).toBe(expected);
    const warnings = result.details?.ptcValue?.warnings ?? [];
    expect.soft(warnings.some((warning: unknown) => String(warning).includes("replace used fuzzy matching"))).toBe(expectFuzzy);

    expect.soft(preview.type).toBe("ok");
    if (preview.type === "ok") {
      expect.soft(preview.data.nextContent).toBe(expected);
    }
  });
});


describe("fuzzy replace source span mapping", () => {
  it.each([
    {
      name: "single boundary-spanning match",
      content: "prefix\t  alpha   \t suffix",
      oldText: "\nalpha\n",
      all: false,
      expected: "prefixXsuffix",
      count: 1,
      usedFuzzyMatch: true,
    },
    {
      name: "all:true boundary-spanning matches",
      content: "\t alpha  | \nalpha\t\t|",
      oldText: "\ralpha\r",
      all: true,
      expected: "X|X|",
      count: 2,
      usedFuzzyMatch: true,
    },
    {
      name: "line terminator at the match boundary",
      content: "prefix alpha \r\nsuffix",
      oldText: "alpha\t",
      all: false,
      expected: "prefix Xsuffix",
      count: 1,
      usedFuzzyMatch: true,
    },
    {
      name: "overlapping normalized all:true candidates",
      content: "a  a  a",
      oldText: "a a",
      all: true,
      expected: "X  a",
      count: 1,
      usedFuzzyMatch: true,
    },
    {
      name: "single exact match precedence",
      content: "alpha beta",
      oldText: "alpha beta",
      all: false,
      expected: "X",
      count: 1,
      usedFuzzyMatch: false,
    },
    {
      name: "all:true exact match precedence",
      content: "alpha beta|alpha beta",
      oldText: "alpha beta",
      all: true,
      expected: "X|X",
      count: 2,
      usedFuzzyMatch: false,
    },
  ])("maps the complete original run for $name", ({ content, oldText, all, expected, count, usedFuzzyMatch }) => {
    expect(replaceText(content, oldText, "X", { fuzzy: true, all })).toEqual({
      content: expected,
      count,
      usedFuzzyMatch,
    });
  });
});


describe("fuzzy replace whitespace-only safety", () => {
  it.each([
    {
      name: "single exact-absent multiline whitespace",
      content: "alpha\nbeta\n",
      oldText: " \t\n  ",
      all: false,
      expected: "alpha\nbeta\n",
      count: 0,
      usedFuzzyMatch: false,
    },
    {
      name: "all:true exact-absent multiline whitespace",
      content: "alpha\nbeta\n",
      oldText: " \t\n  ",
      all: true,
      expected: "alpha\nbeta\n",
      count: 0,
      usedFuzzyMatch: false,
    },
    {
      name: "single exact newline",
      content: "alpha\nbeta\n",
      oldText: "\n",
      all: false,
      expected: "alphaXbeta\n",
      count: 1,
      usedFuzzyMatch: false,
    },
    {
      name: "all:true exact newlines",
      content: "alpha\nbeta\n",
      oldText: "\n",
      all: true,
      expected: "alphaXbetaX",
      count: 2,
      usedFuzzyMatch: false,
    },
  ])("handles $name safely", ({ content, oldText, all, expected, count, usedFuzzyMatch }) => {
    expect(replaceText(content, oldText, "X", { fuzzy: true, all })).toEqual({
      content: expected,
      count,
      usedFuzzyMatch,
    });
  });
});
