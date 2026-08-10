import { readFile, stat } from "node:fs/promises";

/**
 * C mapper using tree-sitter (web-tree-sitter WASM) for AST extraction.
 */
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

const AGGREGATE_KIND: Record<string, SymbolKind> = {
  struct_specifier: SymbolKind.Class,
  union_specifier: SymbolKind.Class,
  enum_specifier: SymbolKind.Enum,
};

const PREPROCESSOR_BRANCH_NODES = new Set([
  "preproc_if",
  "preproc_ifdef",
  "preproc_else",
  "preproc_elif",
]);

function aggregateLabel(type: string): string {
  if (type === "struct_specifier") return "struct";
  if (type === "union_specifier") return "union";
  return "enum";
}

function signatureOf(node: SyntaxNode, source: string): string {
  const body = node.childForFieldName("body");
  const text = body
    ? source.slice(node.startIndex, body.startIndex)
    : getNodeText(node, source);
  return finalizeSignature(text);
}

function declarationSignature(
  node: SyntaxNode,
  declarator: SyntaxNode,
  aggregate: SyntaxNode | undefined,
  source: string,
): string {
  const aggregateBody = aggregate?.childForFieldName("body");
  const type = node.childForFieldName("type");
  let typePrefix: string;
  if (aggregate && aggregateBody) {
    const beforeBody = source.slice(node.startIndex, aggregateBody.startIndex).trim();
    const afterBody = source.slice(aggregateBody.endIndex, aggregate.endIndex).trim();
    typePrefix = [beforeBody, afterBody].filter(Boolean).join(" ");
  } else {
    const prefixEnd = type?.endIndex ?? declarator.startIndex;
    typePrefix = source.slice(node.startIndex, prefixEnd).trim();
  }
  return finalizeSignature(`${typePrefix} ${getNodeText(declarator, source)}`);
}

function makeAggregate(node: SyntaxNode, nameOverride?: string): FileSymbol {
  const named = node.namedChildren.find((child) => child.type === "type_identifier");
  const name = nameOverride ?? named?.text ?? `(anonymous ${aggregateLabel(node.type)})`;
  const { startLine, endLine } = getLineRange(node);
  const symbol: FileSymbol = {
    name,
    kind: AGGREGATE_KIND[node.type] ?? SymbolKind.Class,
    startLine,
    endLine,
  };
  if (node.type === "union_specifier") symbol.modifiers = ["union"];
  return symbol;
}

function declaratorName(node: SyntaxNode): string | null {
  let current: SyntaxNode | null = node;
  while (current) {
    if (
      current.type === "identifier" ||
      current.type === "type_identifier" ||
      current.type === "field_identifier"
    ) {
      return current.text;
    }
    const next: SyntaxNode | null =
      current.childForFieldName("declarator") ??
      current.namedChildren.find(
        (c) =>
          c.type.endsWith("declarator") ||
          c.type === "identifier" ||
          c.type === "type_identifier"
      ) ??
      null;
    if (!next || next === current) return null;
    current = next;
  }
  return null;
}

function hasStatic(node: SyntaxNode): boolean {
  return node.namedChildren.some(
    (c) => c.type === "storage_class_specifier" && c.text === "static"
  );
}

interface DeclaratorInfo {
  name: string;
  denotesFunction: boolean;
}

function declaratorInfo(node: SyntaxNode): DeclaratorInfo | null {
  let current: SyntaxNode | null = node;
  let innermostOperator: "function" | "pointer" | null = null;
  while (current) {
    if (current.type === "function_declarator") innermostOperator = "function";
    if (current.type === "pointer_declarator") innermostOperator = "pointer";
    if (current.type === "identifier" || current.type === "field_identifier") {
      return {
        name: current.text,
        denotesFunction: innermostOperator === "function",
      };
    }
    const next: SyntaxNode | null =
      current.childForFieldName("declarator") ??
      current.namedChildren.find(
        (child) =>
          child.type.endsWith("declarator") ||
          child.type === "identifier" ||
          child.type === "field_identifier",
      ) ??
      null;
    if (!next || next === current) return null;
    current = next;
  }
  return null;
}

function topLevelDeclarators(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter(
    (child) => child.type.endsWith("declarator") || child.type === "identifier",
  );
}

function fieldDeclarators(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter(
    (_child, index) => node.fieldNameForNamedChild(index) === "declarator",
  );
}

function preprocessorSymbol(node: SyntaxNode): FileSymbol | null {
  if (node.type !== "preproc_def" && node.type !== "preproc_function_def") {
    return null;
  }
  const name = node.namedChildren.find((child) => child.type === "identifier")?.text;
  if (!name) return null;
  const { startLine } = getLineRange(node);
  return {
    name,
    kind: SymbolKind.Constant,
    startLine,
    endLine: startLine,
  };
}

function nestedPreprocessorSymbols(node: SyntaxNode): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  for (const child of node.namedChildren) {
    const macro = preprocessorSymbol(child);
    if (macro) {
      symbols.push(macro);
    } else {
      symbols.push(...nestedPreprocessorSymbols(child));
    }
  }
  return symbols;
}

export function extractCSymbols(root: SyntaxNode, source: string): FileSymbol[] {
  const symbols: FileSymbol[] = [];
  for (const node of root.namedChildren) {
    const { startLine } = getLineRange(node);
    const macro = preprocessorSymbol(node);
    if (macro) {
      symbols.push(macro);
      continue;
    }
    if (PREPROCESSOR_BRANCH_NODES.has(node.type)) {
      symbols.push(...extractCSymbols(node, source));
      continue;
    }
    if (node.type in AGGREGATE_KIND) {
      symbols.push(makeAggregate(node));
      continue;
    }
    if (node.type === "type_definition") {
      const { endLine } = getLineRange(node);
      const aggregate = node.namedChildren.find((child) => child.type in AGGREGATE_KIND);
      const declarators = fieldDeclarators(node);
      if (aggregate) {
        const tag = aggregate.namedChildren.find(
          (child) => child.type === "type_identifier",
        )?.text;
        const definesAggregate = aggregate.childForFieldName("body") !== null;
        const emittedTag = Boolean(tag && definesAggregate);
        if (emittedTag) symbols.push(makeAggregate(aggregate));
        for (const declarator of declarators) {
          const alias = declaratorName(declarator);
          if (!alias) continue;
          const isDirectAggregateAlias = declarator.type === "type_identifier";
          if (isDirectAggregateAlias && emittedTag && alias === tag) continue;
          if (isDirectAggregateAlias) {
            const aliasSymbol = makeAggregate(aggregate, alias);
            aliasSymbol.startLine = startLine;
            aliasSymbol.endLine = endLine;
            symbols.push(aliasSymbol);
          } else {
            symbols.push({
              name: alias,
              kind: SymbolKind.Type,
              startLine,
              endLine,
              signature: declarationSignature(node, declarator, aggregate, source),
            });
          }
        }
      } else {
        for (const declarator of declarators) {
          const alias = declaratorName(declarator);
          if (!alias) continue;
          symbols.push({
            name: alias,
            kind: SymbolKind.Type,
            startLine,
            endLine,
            signature: declarationSignature(node, declarator, undefined, source),
          });
        }
      }
      continue;
    }
    if (node.type === "function_definition") {
      const { endLine } = getLineRange(node);
      const declarator =
        node.childForFieldName("declarator") ??
        node.namedChildren.find((child) => child.type.endsWith("declarator"));
      const info = declarator ? declaratorInfo(declarator) : null;
      if (info?.denotesFunction) {
        symbols.push({
          name: info.name,
          kind: SymbolKind.Function,
          startLine,
          endLine,
          signature: signatureOf(node, source),
          isExported: !hasStatic(node),
        });
      }
      symbols.push(...nestedPreprocessorSymbols(node));
      continue;
    }
    if (node.type === "declaration") {
      const { endLine } = getLineRange(node);
      const declarators = topLevelDeclarators(node);
      const aggregate = node.namedChildren.find((child) => child.type in AGGREGATE_KIND);
      const definesAggregate = aggregate?.childForFieldName("body") !== null;
      if (aggregate && (definesAggregate || declarators.length === 0)) {
        symbols.push(makeAggregate(aggregate));
      }

      for (const declarator of declarators) {
        const info = declaratorInfo(declarator);
        if (!info) continue;
        symbols.push({
          name: info.name,
          kind: info.denotesFunction ? SymbolKind.Function : SymbolKind.Variable,
          startLine,
          endLine,
          signature: declarationSignature(node, declarator, aggregate, source),
          ...(info.denotesFunction ? { isExported: !hasStatic(node) } : {}),
        });
      }
    }
  }
  return symbols;
}

/**
 * Generate a file map for a C file using tree-sitter.
 */
export async function cMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  const parser = await getWasmParser("c");
  if (!parser) return null;
  let tree: Tree | null = null;
  try {
    const stats = await stat(filePath);
    const content = await readFile(filePath, "utf8");
    if (signal?.aborted) return null;

    tree = parser.parse(content);
    if (!tree) return null;
    // Error recovery can reinterpret malformed tokens as plausible declarations.
    // Fall through rather than returning a corrupted map marked as Full.
    if (tree.rootNode.hasError) return null;

    const symbols = extractCSymbols(tree.rootNode, content);

    // Contract: no extracted symbols means "miss" so ctags/regex fallback can run.
    if (symbols.length === 0) return null;

    return {
      path: filePath,
      totalLines: content.split("\n").length,
      totalBytes: stats.size,
      language: "C",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (err) {
    reportParserError(
      `wasm:parse:c:${err instanceof Error ? err.message : String(err)}`,
      err,
      { context: "C tree-sitter parse failed" }
    );
    return null;
  } finally {
    disposeTreeAndParser(tree, parser, "C");
  }
}
