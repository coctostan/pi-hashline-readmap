import type { FileSymbol } from "../types.js";
import { SymbolKind } from "../enums.js";

export type JsonSourceNodeType =
  | "object"
  | "array"
  | "string"
  | "number"
  | "boolean"
  | "null";

export interface JsonSourceProperty {
  key: string;
  keyStart: number;
  value: JsonSourceNode;
}

export interface JsonSourceNode {
  type: JsonSourceNodeType;
  start: number;
  end: number;
  properties: JsonSourceProperty[];
  elements: JsonSourceNode[];
}

interface JsonStringToken {
  value: string;
  start: number;
  end: number;
}

class JsonSourceParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): JsonSourceNode | null {
    try {
      this.skipWhitespace();
      const node = this.parseValue();
      this.skipWhitespace();
      return this.index === this.source.length ? node : null;
    } catch {
      return null;
    }
  }

  private parseValue(): JsonSourceNode {
    const char = this.source[this.index];
    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"') {
      const token = this.parseStringToken();
      return this.node("string", token.start, token.end);
    }
    if (char === "t") return this.parseLiteral("true", "boolean");
    if (char === "f") return this.parseLiteral("false", "boolean");
    if (char === "n") return this.parseLiteral("null", "null");
    return this.parseNumber();
  }

  private parseObject(): JsonSourceNode {
    const start = this.index;
    this.expect("{");
    const properties: JsonSourceProperty[] = [];
    this.skipWhitespace();
    if (this.source[this.index] === "}") {
      this.index++;
      return this.node("object", start, this.index, properties);
    }

    while (true) {
      this.skipWhitespace();
      const key = this.parseStringToken();
      this.skipWhitespace();
      this.expect(":");
      this.skipWhitespace();
      const value = this.parseValue();
      properties.push({ key: key.value, keyStart: key.start, value });
      this.skipWhitespace();
      if (this.source[this.index] === "}") {
        this.index++;
        return this.node("object", start, this.index, properties);
      }
      this.expect(",");
    }
  }

  private parseArray(): JsonSourceNode {
    const start = this.index;
    this.expect("[");
    const elements: JsonSourceNode[] = [];
    this.skipWhitespace();
    if (this.source[this.index] === "]") {
      this.index++;
      return this.node("array", start, this.index, [], elements);
    }

    while (true) {
      this.skipWhitespace();
      elements.push(this.parseValue());
      this.skipWhitespace();
      if (this.source[this.index] === "]") {
        this.index++;
        return this.node("array", start, this.index, [], elements);
      }
      this.expect(",");
    }
  }

  private parseStringToken(): JsonStringToken {
    const start = this.index;
    this.expect('"');
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === '"') {
        this.index++;
        const raw = this.source.slice(start, this.index);
        return { value: JSON.parse(raw) as string, start, end: this.index };
      }
      if (char === "\\") {
        this.index++;
        const escape = this.source[this.index];
        if (!escape || !'"\\/bfnrtu'.includes(escape)) {
          throw new SyntaxError("Invalid JSON string escape");
        }
        if (escape === "u") {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            throw new SyntaxError("Invalid JSON unicode escape");
          }
          this.index += 5;
        } else {
          this.index++;
        }
        continue;
      }
      if ((char?.charCodeAt(0) ?? 0) <= 0x1f) {
        throw new SyntaxError("Invalid control character in JSON string");
      }
      this.index++;
    }
    throw new SyntaxError("Unterminated JSON string");
  }

  private parseLiteral(
    literal: "true" | "false" | "null",
    type: "boolean" | "null",
  ): JsonSourceNode {
    const start = this.index;
    if (!this.source.startsWith(literal, this.index)) {
      throw new SyntaxError(`Expected ${literal}`);
    }
    this.index += literal.length;
    return this.node(type, start, this.index);
  }

  private parseNumber(): JsonSourceNode {
    const start = this.index;
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(
      this.source.slice(this.index),
    );
    if (!match) throw new SyntaxError("Expected JSON value");
    this.index += match[0].length;
    return this.node("number", start, this.index);
  }

  private node(
    type: JsonSourceNodeType,
    start: number,
    end: number,
    properties: JsonSourceProperty[] = [],
    elements: JsonSourceNode[] = [],
  ): JsonSourceNode {
    return { type, start, end, properties, elements };
  }

  private expect(char: string): void {
    if (this.source[this.index] !== char) {
      throw new SyntaxError(`Expected ${char}`);
    }
    this.index++;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.index] ?? "")) this.index++;
  }
}

export function parseJsonSource(source: string): JsonSourceNode | null {
  return new JsonSourceParser(source).parse();
}

function createLineLookup(source: string): (offset: number) => number {
  const starts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return (offset: number) => {
    let low = 0;
    let high = starts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= offset) low = middle;
      else high = middle;
    }
    return low + 1;
  };
}

function signatureForNode(node: JsonSourceNode): string {
  if (node.type === "object") return "{...}";
  if (node.type === "array") {
    if (node.elements.length === 0) return "[]";
    const first = node.elements[0]!;
    const elementType = first.type === "object"
      ? "{...}"
      : first.type === "array"
        ? "[...]"
        : first.type;
    return `[](${node.elements.length}) ${elementType}`;
  }
  return node.type;
}

function childrenForNode(
  node: JsonSourceNode,
  lineAt: (offset: number) => number,
): FileSymbol[] | undefined {
  if (node.type === "object") {
    const children = node.properties.map((property) =>
      symbolForNode(property.key, property.keyStart, property.value, lineAt)
    );
    return children.length > 0 ? children : undefined;
  }
  if (node.type === "array") {
    const children = node.elements.map((element, index) =>
      symbolForNode(`[${index}]`, element.start, element, lineAt)
    );
    return children.length > 0 ? children : undefined;
  }
  return undefined;
}

function symbolForNode(
  name: string,
  startOffset: number,
  node: JsonSourceNode,
  lineAt: (offset: number) => number,
): FileSymbol {
  const children = childrenForNode(node, lineAt);
  return {
    name,
    kind: SymbolKind.Property,
    signature: signatureForNode(node),
    startLine: lineAt(startOffset),
    endLine: lineAt(Math.max(node.start, node.end - 1)),
    ...(children ? { children } : {}),
  };
}

export function symbolsFromJsonSource(source: string): FileSymbol[] {
  const root = parseJsonSource(source);
  if (!root) return [];
  const lineAt = createLineLookup(source);

  if (root.type === "object") {
    return root.properties.map((property) =>
      symbolForNode(property.key, property.keyStart, property.value, lineAt)
    );
  }

  if (root.type === "array") {
    return root.elements.map((element, index) =>
      symbolForNode(`[${index}]`, element.start, element, lineAt)
    );
  }

  return [];
}
