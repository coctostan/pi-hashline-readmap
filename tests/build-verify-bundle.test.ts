import { describe, expect, it } from "vitest";
import { verifyBundle } from "../scripts/build.mjs";

const meta = (...inputs: string[]) => ({
  inputs: Object.fromEntries(inputs.map((input) => [input, { bytes: 1, imports: [] }])),
});

describe("verifyBundle — ESM syntax and external peers", () => {
  it("accepts ESM output whose peers stay external", () => {
    expect(() =>
      verifyBundle({
        code: 'import { Type } from "typebox";\nexport default function init() {}\n',
        metafile: meta("index.ts", "src/read.ts"),
      }),
    ).not.toThrow();
  });

  it("rejects output that lost ESM syntax", () => {
    expect(() =>
      verifyBundle({ code: '"use strict";\nmodule.exports = function init() {};\n', metafile: meta("index.ts") }),
    ).toThrow(/Bundle verification failed:[\s\S]*lost ESM syntax/);
  });

  it.each([
    "node_modules/@earendil-works/pi-coding-agent/dist/index.js",
    "node_modules/typebox/build/index.mjs",
  ])("rejects an inlined Pi peer (%s)", (input) => {
    expect(() =>
      verifyBundle({ code: "export default 1;\n", metafile: meta("index.ts", input) }),
    ).toThrow(new RegExp(`Pi peer inlined into bundle: ${input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });
});

describe("verifyBundle — relative import specifiers", () => {
  it("rejects static and dynamic relative imports", () => {
    expect(() =>
      verifyBundle({ code: 'import x from "./src/read.js";\nexport default x;\n', metafile: meta("index.ts") }),
    ).toThrow(/relative import specifiers/);
    expect(() =>
      verifyBundle({ code: 'export default await import("../x.js");\n', metafile: meta("index.ts") }),
    ).toThrow(/relative import specifiers/);
  });

  it("allows path strings that are not import specifiers (only import/from/import() specifiers count)", () => {
    expect(() =>
      verifyBundle({
        code: 'export const prompt = new URL("../prompts/read.md", import.meta.url);\n',
        metafile: meta("index.ts"),
      }),
    ).not.toThrow();
  });
});
