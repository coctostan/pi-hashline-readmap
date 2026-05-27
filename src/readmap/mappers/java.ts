import { readFile, stat } from "node:fs/promises";

import type { Node as SyntaxNode, Tree } from "web-tree-sitter";

import type { FileMap, FileSymbol } from "../types.js";
import { DetailLevel, SymbolKind } from "../enums.js";
import { getWasmParser } from "../parser-loader.js";
import { reportParserError } from "../parser-errors.js";
import {
  normalizeWhitespace,
  getNodeText,
  getLineRange,
} from "./tree-sitter-helpers.js";

export const MAPPER_VERSION = 4;

const TYPE_KINDS: Record<string, SymbolKind> = {
  class_declaration: SymbolKind.Class,
  interface_declaration: SymbolKind.Interface,
  enum_declaration: SymbolKind.Enum,
  record_declaration: SymbolKind.Class,
  annotation_type_declaration: SymbolKind.Interface,
  module_declaration: SymbolKind.Module,
};

const SKIP_TYPES = new Set([
  "package_declaration",
  "import_declaration",
  "modifiers",
  "annotation",
  "marker_annotation",
  "local_variable_declaration",
]);

const MEMBER_METHOD_TYPES = new Set([
  "method_declaration",
  "constructor_declaration",
  "compact_constructor_declaration",
  "annotation_type_element_declaration",
]);

function extractName(node: SyntaxNode, source: string): string | null {
  const nameNode = node.childForFieldName("name");
  return nameNode ? normalizeWhitespace(getNodeText(nameNode, source)) : null;
}

function formatSignature(node: SyntaxNode, source: string, options?: { stripLeadingAnnotations?: boolean }): string {
  const body = node.childForFieldName("body");
  const end = body ? body.startIndex : node.endIndex;
  let signature = source.slice(node.startIndex, end).replace(/;\s*$/, "");
  if (options?.stripLeadingAnnotations && node.type !== "annotation_type_declaration") {
    signature = signature.replace(/^(?:\s*@[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\([^)]*\))?\s*)+/, "");
  }
  return normalizeWhitespace(signature);
}

function extractModifiers(node: SyntaxNode, source: string): string[] {
  const modifiers = node.namedChildren.find((child) => child?.type === "modifiers");
  if (!modifiers) return [];
  const text = getNodeText(modifiers, source);
  return ["public", "protected", "private", "static", "final", "abstract", "native", "synchronized", "transient", "volatile", "strictfp", "default"]
    .filter((modifier) => new RegExp(`\\b${modifier}\\b`).test(text));
}

function extractImports(root: SyntaxNode, source: string): string[] {
  const imports: string[] = [];
  const visit = (node: SyntaxNode): void => {
    if (node.type === "package_declaration" || node.type === "import_declaration") {
      imports.push(normalizeWhitespace(getNodeText(node, source)));
      return;
    }
    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };
  visit(root);
  return imports;
}

function buildSymbol(
  node: SyntaxNode,
  source: string,
  name: string,
  kind: SymbolKind,
  options?: { stripLeadingAnnotations?: boolean; modifiers?: string[] },
): FileSymbol {
  const modifiers = options?.modifiers ?? extractModifiers(node, source);
  const symbol: FileSymbol = {
    name,
    kind,
    ...getLineRange(node),
    signature: formatSignature(node, source, options),
    isExported: modifiers.includes("public"),
  };
  if (modifiers.length > 0) {
    symbol.modifiers = modifiers;
  }
  return symbol;
}

function variableDeclarators(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter((child): child is SyntaxNode => !!child && child.type === "variable_declarator");
}

function handleVariableDeclaration(node: SyntaxNode, source: string, parent: FileSymbol | undefined, rootSymbols: FileSymbol[]): void {
  const modifiers = extractModifiers(node, source);
  const kind = node.type === "constant_declaration" || (modifiers.includes("static") && modifiers.includes("final"))
    ? SymbolKind.Constant
    : SymbolKind.Property;

  for (const declarator of variableDeclarators(node)) {
    const name = extractName(declarator, source);
    if (!name) continue;
    const symbol = buildSymbol(declarator, source, name, kind, { modifiers });
    (parent ? (parent.children ??= []) : rootSymbols).push(symbol);
  }
}

function extractSymbols(root: SyntaxNode, source: string): FileSymbol[] {
  const rootSymbols: FileSymbol[] = [];

  const visit = (node: SyntaxNode, parent?: FileSymbol): void => {
    const typeKind = TYPE_KINDS[node.type];
    if (typeKind) {
      const name = extractName(node, source);
      if (!name) return;
      const symbol = buildSymbol(node, source, name, typeKind, { stripLeadingAnnotations: Boolean(parent) });
      (parent ? (parent.children ??= []) : rootSymbols).push(symbol);
      const body = node.childForFieldName("body");
      for (const child of body?.namedChildren ?? []) {
        if (child) visit(child, symbol);
      }
      return;
    }

    if (MEMBER_METHOD_TYPES.has(node.type)) {
      const name = extractName(node, source);
      if (!name) return;
      (parent ? (parent.children ??= []) : rootSymbols).push(buildSymbol(node, source, name, SymbolKind.Method));
      return;
    }

    if (node.type === "static_initializer") {
      (parent ? (parent.children ??= []) : rootSymbols).push(buildSymbol(node, source, "<clinit>", SymbolKind.Method));
      return;
    }

    if (node.type === "field_declaration" || node.type === "constant_declaration") {
      handleVariableDeclaration(node, source, parent, rootSymbols);
      return;
    }

    if (node.type === "enum_constant") {
      const name = extractName(node, source);
      if (!name) return;
      const symbol = buildSymbol(node, source, name, SymbolKind.Constant);
      (parent ? (parent.children ??= []) : rootSymbols).push(symbol);
      const body = node.childForFieldName("body");
      for (const child of body?.namedChildren ?? []) {
        if (child) visit(child, symbol);
      }
      return;
    }

    if (SKIP_TYPES.has(node.type)) return;
    for (const child of node.namedChildren) {
      if (child) visit(child, parent);
    }
  };

  visit(root);
  return rootSymbols;
}

export async function javaMapperFromContent(
  filePath: string,
  content: string,
  signal?: AbortSignal,
): Promise<FileMap | null> {
  const parser = await getWasmParser("java");
  if (!parser) return null;
  let tree: Tree | null = null;
  try {
    if (signal?.aborted) return null;
    tree = parser.parse(content);
    if (!tree) return null;
    const symbols = extractSymbols(tree.rootNode, content);
    if (symbols.length === 0) return null;
    const imports = extractImports(tree.rootNode, content);
    return {
      path: filePath,
      totalLines: content.split("\n").length,
      totalBytes: Buffer.byteLength(content, "utf8"),
      language: "Java",
      symbols,
      imports,
      detailLevel: DetailLevel.Full,
    };
  } catch (err) {
    reportParserError(`wasm:parse:java:${err instanceof Error ? err.message : String(err)}`, err, {
      context: "Java tree-sitter parse failed",
    });
    return null;
  } finally {
    tree?.delete();
    parser.delete();
  }
}

export async function javaMapper(filePath: string, signal?: AbortSignal): Promise<FileMap | null> {
  const parser = await getWasmParser("java");
  if (!parser) return null;
  let tree: Tree | null = null;
  try {
    const stats = await stat(filePath);
    const content = await readFile(filePath, "utf8");
    if (signal?.aborted) return null;
    tree = parser.parse(content);
    if (!tree) return null;
    const symbols = extractSymbols(tree.rootNode, content);
    if (symbols.length === 0) return null;
    const imports = extractImports(tree.rootNode, content);
    return {
      path: filePath,
      totalLines: content.split("\n").length,
      totalBytes: stats.size,
      language: "Java",
      symbols,
      imports,
      detailLevel: DetailLevel.Full,
    };
  } catch (err) {
    reportParserError(`wasm:parse:java:${err instanceof Error ? err.message : String(err)}`, err, {
      context: "Java tree-sitter parse failed",
    });
    return null;
  } finally {
    tree?.delete();
    parser.delete();
  }
}
