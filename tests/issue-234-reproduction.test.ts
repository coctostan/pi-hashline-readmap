import { describe, expect, it } from "vitest";

import { DetailLevel, SymbolKind } from "../src/readmap/enums.js";
import { formatFileMap } from "../src/readmap/formatter.js";
import type { FileMap } from "../src/readmap/types.js";

interface PartialCase {
  signature: string;
  expected: string;
  modifiers?: string[];
  name?: string;
  kind?: SymbolKind;
}

interface DeclarationCase {
  signature: string;
  name?: string;
  kind?: SymbolKind;
}

function mapFor(
  signature: string,
  modifiers?: string[],
  name = "id",
  kind: SymbolKind = SymbolKind.Method,
): FileMap {
  return {
    path: "/tmp/example.py",
    totalLines: 3,
    totalBytes: 45,
    language: "Python",
    symbols: [{ name, kind, startLine: 1, endLine: 3, signature, modifiers }],
    imports: [],
    detailLevel: DetailLevel.Full,
  };
}

describe("issue 234 signature regression", () => {
  it("renders partial signatures with the symbol name and modifiers", () => {
    const partialCases: PartialCase[] = [
      {
        signature: "(self, id: int) -> None",
        expected: "id(self, id: int) -> None: [1-3]",
      },
      {
        signature: "(self, user_id: int) -> None",
        expected: "id(self, user_id: int) -> None: [1-3]",
      },
      {
        signature: "(self, value: id) -> None",
        modifiers: ["async"],
        expected: "async id(self, value: id) -> None: [1-3]",
      },
      {
        signature: "(value: number): id & (() => void)",
        kind: SymbolKind.Variable,
        expected: "id(value: number): id & (() => void) = ... [1-3]",
      },
      {
        signature: "(value int) id",
        kind: SymbolKind.Function,
        expected: "id(value int) id: [1-3]",
      },
      {
        signature: "user_id",
        modifiers: ["export"],
        kind: SymbolKind.Variable,
        expected: "export id: user_id = ... [1-3]",
      },
      {
        signature: "*id",
        kind: SymbolKind.Variable,
        expected: "id: *id = ... [1-3]",
      },
      {
        signature: "async (value: number): user_id",
        modifiers: ["async", "export"],
        kind: SymbolKind.Variable,
        expected: "async export id(value: number): user_id = ... [1-3]",
      },
      {
        // Real Go struct-field shape: the helper emits the type only.
        name: "Name",
        signature: "string",
        kind: SymbolKind.Variable,
        expected: "Name: string = ... [1-3]",
      },
      {
        // Real Java static-initializer shape: no name anywhere in the signature.
        name: "<clinit>",
        signature: "static { instanceCount = 0; }",
        expected: "<clinit>: static { instanceCount = 0; }: [1-3]",
      },
    ];

    for (const partial of partialCases) {
      const output = formatFileMap(
        mapFor(
          partial.signature,
          partial.modifiers,
          partial.name ?? "id",
          partial.kind ?? SymbolKind.Method,
        ),
        DetailLevel.Full,
      );
      expect(output.split("\n")).toContain(partial.expected);
    }
  });

  it("leaves full declarations untouched", () => {
    const declarations: DeclarationCase[] = [
      { signature: "pub fn id(id: u32) -> bool" },
      { signature: "pub fn id<'a>(id: &'a str) -> &'a str" },
      { signature: "int id(int id)" },
      { signature: "public int id(int id)" },
      { signature: '@Pattern(regexp="(") public int id(int id)' },
      { name: "operator()", signature: "bool Widget::operator()() const" },
      {
        name: "callback",
        signature: "void (*callback)(int)",
        kind: SymbolKind.Variable,
      },
      { name: "*T.id", signature: "(*T) id(value int) bool" },
      {
        // Real TypeScript typed-variable shape — must not become "pending: pending: ...".
        name: "pending",
        signature: "pending: Promise<void>[]",
        kind: SymbolKind.Variable,
      },
      {
        // Real TypeScript bare-name variable shape.
        name: "nextId",
        signature: "nextId",
        kind: SymbolKind.Variable,
      },
      {
        // Real Rust struct-field shape.
        name: "items",
        signature: "pub items: Vec<T>",
        kind: SymbolKind.Variable,
      },
    ];

    for (const declaration of declarations) {
      const name = declaration.name ?? "id";
      const kind = declaration.kind ?? SymbolKind.Method;
      const output = formatFileMap(
        mapFor(declaration.signature, undefined, name, kind),
        DetailLevel.Full,
      );
      const rendered =
        kind === SymbolKind.Variable
          ? `${declaration.signature} = ... [1-3]`
          : `${declaration.signature}: [1-3]`;

      expect(output.split("\n")).toContain(rendered);
      expect(output).not.toContain(`${name}${declaration.signature}`);
      expect(output).not.toContain(`${name}: ${declaration.signature}`);
    }
  });

  it("keeps reduced detail levels free of signatures and modifiers", () => {
    const partialSignature = "(self, id: int) -> None";

    for (const level of [
      DetailLevel.Compact,
      DetailLevel.Minimal,
      DetailLevel.Outline,
      DetailLevel.Truncated,
    ]) {
      const output = formatFileMap(mapFor(partialSignature, ["async"]), level);

      expect(output.split("\n")).toContain("id: [1-3]");
      expect(output).not.toContain(partialSignature);
      expect(output).not.toContain("async id");
    }
  });
});