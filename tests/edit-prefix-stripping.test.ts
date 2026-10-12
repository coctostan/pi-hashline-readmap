import { beforeAll, describe, expect, it } from "vitest";
import { applyHashlineEdits, computeLineHash, ensureHashInit } from "../src/hashline.js";

beforeAll(async () => {
  await ensureHashInit();
});

const ref = (line: number, text: string) => `${line}:${computeLineHash(line, text)}`;

function setLine(file: string[], line: number, newText: string) {
  return applyHashlineEdits(file.join("\n"), [{ set_line: { anchor: ref(line, file[line - 1]), new_text: newText } }]);
}

describe("LINE:HASH| prefixes in new_text", () => {
  it.each(["12:30|meeting", "3:14|pi", "1:xyz|x"])("keeps %s verbatim when it is not a real anchor of the file", (text) => {
    expect(setLine(["original"], 1, text).content).toBe(text);
  });

  it("strips a pasted row whose LINE:HASH is a real anchor of the file", () => {
    const file = ["alpha", "beta", "gamma"];
    expect(setLine(file, 2, `${ref(2, "beta")}|BETA`).content).toBe("alpha\nBETA\ngamma");
  });

  it("strips only the lines that carry real anchors in a multi-line paste", () => {
    const file = ["alpha", "beta", "gamma"];
    const res = applyHashlineEdits(file.join("\n"), [
      {
        replace_lines: {
          start_anchor: ref(2, "beta"),
          end_anchor: ref(3, "gamma"),
          new_text: `${ref(2, "beta")}|B\n${ref(3, "gamma")}|G\n9:abc|kept`,
        },
      },
    ]);
    expect(res.content).toBe("alpha\nB\nG\n9:abc|kept");
  });
});

describe("bare HASH| prefixes in new_text", () => {
  it.each(["abc|def\nfed|cba", "123|456\n789|012"])("keeps %j verbatim when the hashes are not this file's", (text) => {
    expect(setLine(["original"], 1, text).content).toBe(text);
  });

  it("strips bare prefixes when every line carries a hash of this file", () => {
    const file = ["alpha", "beta", "gamma"];
    const h = (text: string) => computeLineHash(1, text);
    expect(setLine(file, 2, `${h("beta")}|BETA\n${h("gamma")}|GAMMA`).content).toBe("alpha\nBETA\nGAMMA\ngamma");
  });

  it("keeps a multi-line paste when one bare hash is not this file's", () => {
    const file = ["alpha", "beta", "gamma"];
    const text = `${computeLineHash(1, "beta")}|BETA\nabc|other`;
    expect(setLine(file, 2, text).content).toBe(`alpha\n${text}\ngamma`);
  });
});

describe("leading + in new_text", () => {
  it.each(["+ item one\n+ item two", "+1\n+2\n+3", "a\n+b", "+ only"])("keeps %j verbatim", (text) => {
    expect(setLine(["original"], 1, text).content).toBe(text);
  });
});

describe("prefix removal is reported", () => {
  it("warns with the edit index, the count, and the literal opt-out", () => {
    const file = ["alpha", "beta", "gamma"];
    const res = applyHashlineEdits(file.join("\n"), [
      { set_line: { anchor: ref(1, "alpha"), new_text: "ALPHA" } },
      {
        replace_lines: {
          start_anchor: ref(2, "beta"),
          end_anchor: ref(3, "gamma"),
          new_text: `${ref(2, "beta")}|B\n${ref(3, "gamma")}|G`,
        },
      },
    ]);
    expect(res.content).toBe("ALPHA\nB\nG");
    expect(res.warnings).toEqual([
      "edits[1]: removed 2 pasted anchor prefixes (LINE:HASH| or HASH|) from new_text. Pass literal: true on that edit to keep the text exactly as given.",
    ]);
  });

  it("uses the singular for one bare-hash prefix", () => {
    const file = ["aaa", "bbb", "ccc"];
    const res = setLine(file, 2, `${computeLineHash(2, "bbb")}|BBB`);
    expect(res.content).toBe("aaa\nBBB\nccc");
    expect(res.warnings).toEqual([
      "edits[0]: removed 1 pasted anchor prefix (LINE:HASH| or HASH|) from new_text. Pass literal: true on that edit to keep the text exactly as given.",
    ]);
  });

  it("does not warn when nothing was removed", () => {
    expect(setLine(["original"], 1, "12:30|meeting").warnings).toBeUndefined();
  });
});

describe("literal: true", () => {
  it("keeps a real LINE:HASH| prefix in set_line", () => {
    const file = ["alpha", "beta", "gamma"];
    const text = `${ref(2, "beta")}|BETA`;
    const res = applyHashlineEdits(file.join("\n"), [{ set_line: { anchor: ref(2, "beta"), new_text: text, literal: true } }]);
    expect(res.content).toBe(`alpha\n${text}\ngamma`);
    expect(res.warnings).toBeUndefined();
  });

  it("keeps bare known-hash prefixes in replace_lines", () => {
    const file = ["alpha", "beta", "gamma"];
    const text = `${computeLineHash(1, "alpha")}|A\n${computeLineHash(1, "beta")}|B`;
    const res = applyHashlineEdits(file.join("\n"), [
      { replace_lines: { start_anchor: ref(1, "alpha"), end_anchor: ref(2, "beta"), new_text: text, literal: true } },
    ]);
    expect(res.content).toBe(`${text}\ngamma`);
  });

  it("keeps an insert_after payload that starts by repeating its anchor line", () => {
    const res = applyHashlineEdits("alpha\nbeta", [
      { insert_after: { anchor: ref(1, "alpha"), new_text: "alpha\nnew", literal: true } },
    ]);
    expect(res.content).toBe("alpha\nalpha\nnew\nbeta");
  });
});
