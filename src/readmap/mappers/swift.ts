/**
 * Swift mapper using tree-sitter (web-tree-sitter WASM) for AST extraction.
 *
 * The Swift grammar collapses `class`, `struct`, `actor`, `enum`, and
 * `extension` into a single `class_declaration` node whose distinguishing
 * keyword is an anonymous token, and operator overloads expose no
 * `simple_identifier`. Both cases require reading anonymous children, which the
 * shared `findFirstDescendant` helper (namedChildren only) cannot do.
 */
import { readFile, stat } from "node:fs/promises";

import type { Node as SyntaxNode, Tree } from "web-tree-sitter";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";
import { getWasmParser } from "../parser-loader.js";
import { reportParserError } from "../parser-errors.js";
import {
  disposeTreeAndParser,
  getNodeText,
  getLineRange,
  finalizeSignature,
} from "./tree-sitter-helpers.js";

export const MAPPER_VERSION = 2;

const CONTAINER_KEYWORDS = new Set([
  "class",
  "struct",
  "actor",
  "enum",
  "extension",
]);

function containerKeyword(node: SyntaxNode): string | null {
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    if (child && !child.isNamed && CONTAINER_KEYWORDS.has(child.type)) {
      return child.type;
    }
  }
  return null;
}

function containerName(node: SyntaxNode, keyword: string): string | null {
  if (keyword === "extension") {
    const user = node.namedChildren.find((c) => c.type === "user_type");
    return user?.text ?? null;
  }
  return node.namedChildren.find((c) => c.type === "type_identifier")?.text ?? null;
}

function functionName(node: SyntaxNode): string | null {
  const named = node.childForFieldName("name");
  if (named) return named.text;

  let followsFunc = false;
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    if (!child) continue;
    if (!child.isNamed && child.type === "func") {
      followsFunc = true;
      continue;
    }
    if (!followsFunc || child.isExtra) continue;
    if (child.type === "(") return null;
    return child.text;
  }
  return null;
}

function signatureOf(node: SyntaxNode, source: string): string {
  const body = bodyOf(node);
  const text = body
    ? source.slice(node.startIndex, body.startIndex)
    : getNodeText(node, source);
  return finalizeSignature(text);
}

function bodyOf(node: SyntaxNode): SyntaxNode | null {
  return (
    node.namedChildren.find(
      (c) =>
        c.type === "class_body" ||
        c.type === "enum_class_body" ||
        c.type === "protocol_body" ||
        c.type === "function_body"
    ) ?? null
  );
}

function memberSymbol(node: SyntaxNode, source: string): FileSymbol | null {
  const { startLine, endLine } = getLineRange(node);
  if (node.type === "deinit_declaration") {
    return {
      name: "deinit",
      kind: SymbolKind.Method,
      startLine,
      endLine,
      signature: "deinit",
    };
  }
  if (
    node.type === "function_declaration" ||
    node.type === "protocol_function_declaration"
  ) {
    const name = functionName(node);
    if (!name) return null;
    return {
      name,
      kind: SymbolKind.Method,
      startLine,
      endLine,
      signature: signatureOf(node, source),
    };
  }
  return null;
}

function declarationSymbol(node: SyntaxNode, source: string): FileSymbol | null {
  const { startLine, endLine } = getLineRange(node);

  if (node.type === "class_declaration") {
    const keyword = containerKeyword(node);
    if (!keyword) return null;
    const name = containerName(node, keyword);
    if (!name) return null;
    const symbol: FileSymbol = {
      name,
      kind: keyword === "enum" ? SymbolKind.Enum : SymbolKind.Class,
      startLine,
      endLine,
      signature: signatureOf(node, source),
    };
    const body = bodyOf(node);
    if (body) {
      const children: FileSymbol[] = [];
      for (const member of body.namedChildren) {
        const method = memberSymbol(member, source);
        if (method) {
          children.push(method);
          continue;
        }
        const nested = declarationSymbol(member, source);
        if (nested) children.push(nested);
      }
      if (children.length > 0) symbol.children = children;
    }
    return symbol;
  }

  if (node.type === "protocol_declaration") {
    const name = node.namedChildren.find((c) => c.type === "type_identifier")?.text;
    if (!name) return null;
    const symbol: FileSymbol = {
      name,
      kind: SymbolKind.Interface,
      startLine,
      endLine,
      signature: signatureOf(node, source),
    };
    const body = bodyOf(node);
    if (body) {
      const children = body.namedChildren
        .map((member) => memberSymbol(member, source) ?? declarationSymbol(member, source))
        .filter((child): child is FileSymbol => child !== null);
      if (children.length > 0) symbol.children = children;
    }
    return symbol;
  }

  if (node.type === "function_declaration") {
    const name = functionName(node);
    if (!name) return null;
    return {
      name,
      kind: SymbolKind.Function,
      startLine,
      endLine,
      signature: signatureOf(node, source),
    };
  }

  if (node.type === "macro_declaration") {
    const name = node.namedChildren.find((c) => c.type === "simple_identifier")?.text;
    if (!name) return null;
    return {
      name,
      kind: SymbolKind.Function,
      startLine,
      endLine,
      signature: signatureOf(node, source),
    };
  }

  return null;
}

export function extractSwiftSymbols(root: SyntaxNode, source: string): FileSymbol[] {
  return root.namedChildren
    .map((node) => declarationSymbol(node, source))
    .filter((symbol): symbol is FileSymbol => symbol !== null);
}


function hasUnsafeParseError(node: SyntaxNode, parentType?: string): boolean {
  const isKnownExternalMacroScannerError =
    node.type === "ERROR" &&
    ((parentType === "macro_definition" && node.text === "#externalMacro") ||
      (parentType === "ERROR" && node.text === "#"));
  if ((node.type === "ERROR" || node.isMissing) && !isKnownExternalMacroScannerError) {
    return true;
  }
  for (let index = 0; index < node.childCount; index += 1) {
    const child = node.child(index);
    if (child && hasUnsafeParseError(child, node.type)) return true;
  }
  return false;
}

/**
 * Generate a file map for a Swift file using tree-sitter.
 */
export async function swiftMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  const parser = await getWasmParser("swift");
  if (!parser) return null;
  let tree: Tree | null = null;
  try {
    const stats = await stat(filePath);
    const content = await readFile(filePath, "utf8");
    if (signal?.aborted) return null;

    tree = parser.parse(content);
    if (!tree) return null;
    // Error-recovered trees can silently drop or promote declarations while
    // still looking structurally valid. Fall through instead of returning a
    // corrupted map marked as Full.
    if (tree.rootNode.hasError && hasUnsafeParseError(tree.rootNode)) return null;
    const symbols = extractSwiftSymbols(tree.rootNode, content);
    if (symbols.length === 0) return null;

    return {
      path: filePath,
      totalLines: content.split("\n").length,
      totalBytes: stats.size,
      language: "Swift",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (err) {
    reportParserError(
      `wasm:parse:swift:${err instanceof Error ? err.message : String(err)}`,
      err,
      { context: "Swift tree-sitter parse failed" }
    );
    return null;
  } finally {
    disposeTreeAndParser(tree, parser, "Swift");
  }
}
