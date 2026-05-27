import { describe, it, expect } from "vitest";
import {
  normalizeWhitespace,
  getNodeText,
  getLineRange,
  findFirstDescendant,
  finalizeSignature,
} from "../src/readmap/mappers/tree-sitter-helpers.js";

describe("tree-sitter-helpers core primitives", () => {
  it("normalizeWhitespace collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  a   b\t\nc  ")).toBe("a b c");
    expect(normalizeWhitespace("nochange")).toBe("nochange");
  });

  it("getNodeText slices source by node byte offsets", () => {
    const node = { startIndex: 2, endIndex: 5 } as unknown as Parameters<
      typeof getNodeText
    >[0];
    expect(getNodeText(node, "abcdef")).toBe("cde");
  });

  it("getLineRange converts 0-based rows to 1-based lines", () => {
    const node = {
      startPosition: { row: 4 },
      endPosition: { row: 9 },
    } as unknown as Parameters<typeof getLineRange>[0];
    expect(getLineRange(node)).toEqual({ startLine: 5, endLine: 10 });
  });
});

type TestNode = { type: string; namedChildren: TestNode[] };
function n(type: string, children: TestNode[] = []): TestNode {
  return { type, namedChildren: children };
}

describe("tree-sitter-helpers findFirstDescendant", () => {
  it("returns the first descendant matching any requested type", () => {
    const tree = n("root", [n("a", [n("target", [])]), n("b", [])]);
    const found = findFirstDescendant(
      tree as unknown as Parameters<typeof findFirstDescendant>[0],
      ["target"],
    );
    expect(found?.type).toBe("target");
  });

  it("returns null when no descendant matches", () => {
    const tree = n("root", [n("a", []), n("b", [])]);
    const found = findFirstDescendant(
      tree as unknown as Parameters<typeof findFirstDescendant>[0],
      ["missing"],
    );
    expect(found).toBeNull();
  });
});

describe("tree-sitter-helpers finalizeSignature", () => {
  it("strips a trailing semicolon and normalizes whitespace", () => {
    expect(finalizeSignature("pub  fn   foo()  ;  ")).toBe("pub fn foo()");
  });

  it("normalizes whitespace when there is no trailing semicolon", () => {
    expect(finalizeSignature("class   Foo")).toBe("class Foo");
  });
});
