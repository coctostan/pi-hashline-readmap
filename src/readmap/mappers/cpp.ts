import { readFile, stat } from "node:fs/promises";
/**
 * C++ mapper using tree-sitter for AST extraction.
 *
 * Ported from codemap's symbols-cpp.ts.
 */
import type { Node as SyntaxNode, Tree } from "web-tree-sitter";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";
import { getWasmParser } from "../parser-loader.js";
import { reportParserError } from "../parser-errors.js";
import {
  normalizeWhitespace,
  getNodeText,
  getLineRange,
  finalizeSignature,
} from "./tree-sitter-helpers.js";
export const MAPPER_VERSION = 3;

type ScopeKind = "namespace" | "class" | "struct" | "enum";
type AccessLevel = "public" | "protected" | "private";

interface Scope {
  kind: ScopeKind;
  name: string;
  key: string;
  access?: AccessLevel;
}

interface InternalSymbol {
  name: string;
  kind: string;
  signature?: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  parentName?: string;
  docstring?: string;
}

function formatSignature(
  node: SyntaxNode,
  source: string,
  templatePrefix?: string
): string {
  let text = getNodeText(node, source);
  const bodyIndex = text.indexOf("{");
  if (bodyIndex !== -1) {
    text = text.slice(0, bodyIndex);
  }
  text = finalizeSignature(text);
  if (templatePrefix) {
    text = normalizeWhitespace(`${templatePrefix} ${text}`);
  }
  return text;
}

function findDescendantOfType(
  node: SyntaxNode,
  type: string
): SyntaxNode | null {
  for (const child of node.namedChildren) {
    if (!child) continue;
    if (child.type === type) {
      return child;
    }
    const nested = findDescendantOfType(child, type);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function findFirstDescendant(
  node: SyntaxNode,
  types: string[]
): SyntaxNode | null {
  for (const type of types) {
    const found = findDescendantOfType(node, type);
    if (found) {
      return found;
    }
  }
  return null;
}

function collectDescendants(
  node: SyntaxNode,
  type: string
): SyntaxNode[] {
  const results: SyntaxNode[] = [];
  const stack: SyntaxNode[] = [];
  for (const child of node.namedChildren) {
    if (child) stack.push(child);
  }
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    if (current.type === type) {
      results.push(current);
    }
    for (const child of current.namedChildren) {
      if (child) stack.push(child);
    }
  }
  return results;
}

function extractNameFromSignature(
  signature: string,
  pattern: RegExp
): string | null {
  const match = signature.match(pattern);
  return match?.[1] ?? null;
}

function extractQualifiedName(rawName: string): {
  name: string;
  parentName?: string;
} {
  const parts = rawName
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { name: rawName.trim() };
  }
  const name = parts.pop() ?? rawName.trim();
  const parentName = parts.join("::");
  return { name, parentName };
}

function buildScopeKey(parent: string | null, name: string): string {
  return parent ? `${parent}::${name}` : name;
}

function makeAnonymousName(kind: string, line: number): string {
  return `<anonymous@${kind}:${line}>`;
}

function isStaticSignature(signature: string): boolean {
  return /\bstatic\b/.test(signature);
}

function extractTypedefName(
  node: SyntaxNode,
  source: string
): string | null {
  const identifiers = [...collectDescendants(node, "identifier")].sort(
    (a, b) => a.endIndex - b.endIndex
  );
  const last = identifiers.at(-1);
  if (!last) {
    return null;
  }
  return normalizeWhitespace(getNodeText(last, source));
}

function extractAliasName(
  node: SyntaxNode,
  source: string
): string | null {
  const nameNode =
    node.childForFieldName("name") ??
    findFirstDescendant(node, ["type_identifier", "identifier"]);
  return nameNode ? normalizeWhitespace(getNodeText(nameNode, source)) : null;
}

function extractSpecifierName(
  node: SyntaxNode,
  source: string,
  pattern: RegExp
): string | null {
  const nameNode =
    node.childForFieldName("name") ??
    findFirstDescendant(node, ["type_identifier", "identifier"]);
  if (nameNode) {
    return normalizeWhitespace(getNodeText(nameNode, source));
  }
  const signature = formatSignature(node, source);
  return extractNameFromSignature(signature, pattern);
}

function extractFunctionName(
  node: SyntaxNode,
  source: string
): string | null {
  const declarator = node.childForFieldName("declarator") ?? node;
  const nameTarget = declarator.childForFieldName("declarator") ?? declarator;
  const directTypes = new Set([
    "qualified_identifier",
    "scoped_identifier",
    "destructor_name",
    "operator_name",
    "field_identifier",
    "identifier",
  ]);
  if (directTypes.has(nameTarget.type)) {
    return normalizeWhitespace(getNodeText(nameTarget, source));
  }
  const nameNode = findFirstDescendant(nameTarget, [
    "qualified_identifier",
    "scoped_identifier",
    "destructor_name",
    "operator_name",
    "field_identifier",
    "identifier",
  ]);
  if (!nameNode) {
    return null;
  }
  return normalizeWhitespace(getNodeText(nameNode, source));
}

function collectFieldNames(
  node: SyntaxNode,
  source: string
): string[] {
  const names = collectDescendants(node, "field_identifier").map((child) =>
    normalizeWhitespace(getNodeText(child, source))
  );
  if (names.length > 0) {
    return names;
  }

  const fallback: string[] = [];
  const identifiers = collectDescendants(node, "identifier");
  for (const ident of identifiers) {
    const { parent } = ident;
    if (parent && parent.type.includes("declarator")) {
      fallback.push(normalizeWhitespace(getNodeText(ident, source)));
    }
  }
  return fallback;
}

/**
 * Extract Doxygen-style doc comment from preceding siblings.
 * Handles /// and /** styles.
 */
function extractDocComment(
  node: SyntaxNode,
  source: string
): string | undefined {
  let prev = node.previousNamedSibling;

  // Check for block comment (/** ... */)
  if (prev && prev.type === "comment") {
    const text = getNodeText(prev, source);
    if (text.startsWith("/**")) {
      const body = text
        .replace(/^\/\*\*\s*/, "")
        .replace(/\s*\*\/$/, "")
        .split("\n")
        .map((l) => l.replace(/^\s*\*\s?/, "").trim())
        .find(Boolean);
      const firstLine = body?.trim();
      return firstLine || undefined;
    }
  }

  // Check for line comments (/// ...)
  const docLines: string[] = [];
  while (prev && prev.type === "comment") {
    const text = getNodeText(prev, source);
    if (text.startsWith("///")) {
      docLines.unshift(text.replace(/^\/\/\/\s?/, ""));
      prev = prev.previousNamedSibling;
      continue;
    }
    break;
  }

  if (docLines.length === 0) {
    return undefined;
  }
  const firstLine = docLines[0]?.trim();
  return firstLine || undefined;
}

/**
 * Extract C++ symbols using tree-sitter.
 */
function extractCppSymbols(root: SyntaxNode, content: string): InternalSymbol[] {
  const symbols: InternalSymbol[] = [];
  const scopeStack: Scope[] = [];
  const classKeys = new Set<string>();

  const currentScope = (): Scope | undefined => scopeStack.at(-1);
  const currentClassScope = (): Scope | undefined => {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      const scope = scopeStack[i];
      if (scope && (scope.kind === "class" || scope.kind === "struct")) {
        return scope;
      }
    }
    return undefined;
  };

  const pushScope = (scope: Scope): void => {
    scopeStack.push(scope);
  };

  const popScope = (): void => {
    scopeStack.pop();
  };

  const addSymbol = (entry: InternalSymbol): void => {
    symbols.push(entry);
  };

  const handleNamespace = (
    node: SyntaxNode,
    templatePrefix?: string
  ): void => {
    const signature = formatSignature(node, content, templatePrefix);
    const name =
      extractSpecifierName(node, content, /\bnamespace\s+([A-Za-z_][\w:]*)/) ??
      makeAnonymousName("namespace", node.startPosition.row + 1);
    const { name: cleanName, parentName } = extractQualifiedName(name);
    const parentKey = parentName ?? currentScope()?.key ?? null;
    const key = buildScopeKey(parentKey, cleanName);
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name: cleanName,
      kind: "namespace",
      signature,
      startLine,
      endLine,
      exported: true,
      parentName: parentKey ?? undefined,
      docstring: extractDocComment(node, content),
    });

    pushScope({ kind: "namespace", name: cleanName, key });
    const body =
      node.childForFieldName("body") ??
      node.namedChildren.find((child) => child?.type === "declaration_list") ?? null;
    const children = body ? body.namedChildren : node.namedChildren;
    for (const child of children) {
      if (child) visit(child);
    }
    popScope();
  };

  const handleClass = (
    node: SyntaxNode,
    kind: "class" | "struct",
    templatePrefix?: string
  ): void => {
    const signature = formatSignature(node, content, templatePrefix);
    const name =
      extractSpecifierName(
        node,
        content,
        new RegExp(`\\b${kind}\\s+([A-Za-z_][\\w:]*)`)
      ) ?? makeAnonymousName(kind, node.startPosition.row + 1);
    const { name: cleanName, parentName } = extractQualifiedName(name);
    const parentKey = parentName ?? currentScope()?.key ?? null;
    const key = buildScopeKey(parentKey, cleanName);
    classKeys.add(key);
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name: cleanName,
      kind,
      signature,
      startLine,
      endLine,
      exported: true,
      parentName: parentKey ?? undefined,
      docstring: extractDocComment(node, content),
    });

    const access: AccessLevel = kind === "struct" ? "public" : "private";
    pushScope({ kind, name: cleanName, key, access });

    const body =
      node.childForFieldName("body") ??
      node.namedChildren.find((child) =>
        !!child && ["field_declaration_list", "declaration_list"].includes(child.type)
      ) ?? null;
    const children = body ? body.namedChildren : node.namedChildren;
    for (const child of children) {
      if (child) visit(child);
    }
    popScope();
  };

  const handleEnum = (
    node: SyntaxNode,
    templatePrefix?: string
  ): void => {
    const signature = formatSignature(node, content, templatePrefix);
    const name =
      extractSpecifierName(
        node,
        content,
        /\benum(?:\s+(?:class|struct))?\s+([A-Za-z_][\w:]*)/
      ) ?? makeAnonymousName("enum", node.startPosition.row + 1);
    const { name: cleanName, parentName } = extractQualifiedName(name);
    const parentKey = parentName ?? currentScope()?.key ?? null;
    const key = buildScopeKey(parentKey, cleanName);
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name: cleanName,
      kind: "enum",
      signature,
      startLine,
      endLine,
      exported: true,
      parentName: parentKey ?? undefined,
      docstring: extractDocComment(node, content),
    });

    for (const enumerator of collectDescendants(node, "enumerator")) {
      const ident = findFirstDescendant(enumerator, ["identifier"]);
      if (!ident) {
        continue;
      }
      const enumName = normalizeWhitespace(getNodeText(ident, content));
      let enumSignature = normalizeWhitespace(getNodeText(enumerator, content));
      enumSignature = enumSignature.replace(/,\s*$/, "");
      const range = getLineRange(enumerator);
      addSymbol({
        name: enumName,
        kind: "enum_member",
        signature: enumSignature,
        startLine: range.startLine,
        endLine: range.endLine,
        exported: false,
        parentName: key,
      });
    }
  };

  const handleTypedef = (
    node: SyntaxNode,
    templatePrefix?: string
  ): void => {
    const signature = formatSignature(node, content, templatePrefix);
    const name =
      extractTypedefName(node, content) ??
      extractNameFromSignature(
        signature,
        /\btypedef\b[\s\S]*?([A-Za-z_][\w:]*)/
      );
    if (!name) {
      return;
    }
    const { name: cleanName, parentName } = extractQualifiedName(name);
    const parentKey = parentName ?? currentScope()?.key ?? null;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name: cleanName,
      kind: "type",
      signature,
      startLine,
      endLine,
      exported: true,
      parentName: parentKey ?? undefined,
      docstring: extractDocComment(node, content),
    });
  };

  const handleAlias = (
    node: SyntaxNode,
    templatePrefix?: string
  ): void => {
    const signature = formatSignature(node, content, templatePrefix);
    const name = extractAliasName(node, content);
    if (!name) {
      return;
    }
    const { name: cleanName, parentName } = extractQualifiedName(name);
    const parentKey = parentName ?? currentScope()?.key ?? null;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name: cleanName,
      kind: "type",
      signature,
      startLine,
      endLine,
      exported: true,
      parentName: parentKey ?? undefined,
      docstring: extractDocComment(node, content),
    });
  };

  const handleFunction = (
    node: SyntaxNode,
    templatePrefix?: string
  ): void => {
    const signature = formatSignature(node, content, templatePrefix);
    const rawName = extractFunctionName(node, content);
    if (!rawName) {
      return;
    }
    const { name, parentName: qualifiedParent } = extractQualifiedName(rawName);
    const scope = currentScope();
    let parentName = qualifiedParent ?? scope?.key;
    if (
      qualifiedParent &&
      scope?.kind === "namespace" &&
      !qualifiedParent.includes("::")
    ) {
      parentName = `${scope.key}::${qualifiedParent}`;
    }
    const classScope = currentClassScope();
    const classKey =
      parentName && classKeys.has(parentName) ? parentName : classScope?.key;
    const className = classKey
      ? (classKey.split("::").pop() ?? classKey)
      : undefined;

    let kind = "function";
    if (classKey && parentName === classKey) {
      if (className && name === className) {
        kind = "constructor";
      } else if (className && name === `~${className}`) {
        kind = "destructor";
      } else {
        kind = "method";
      }
    }

    const access = classScope?.access;
    const isStatic = isStaticSignature(signature);
    // Class members: use access specifier (public = exported)
    // Free functions: static keyword means internal linkage (not exported)
    const exported = classScope ? access === "public" : !isStatic;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind,
      signature,
      startLine,
      endLine,
      exported,
      parentName: parentName ?? undefined,
      docstring: extractDocComment(node, content),
    });
  };

  const handleField = (node: SyntaxNode): void => {
    const classScope = currentClassScope();
    if (!classScope) {
      return;
    }

    const names = collectFieldNames(node, content);
    if (names.length === 0) {
      return;
    }
    const signature = formatSignature(node, content);
    const { startLine, endLine } = getLineRange(node);
    const exported = classScope.access === "public";

    for (const name of names) {
      addSymbol({
        name,
        kind: "property",
        signature,
        startLine,
        endLine,
        exported,
        parentName: classScope.key,
      });
    }
  };

  const handleAccessSpecifier = (node: SyntaxNode): void => {
    const classScope = currentClassScope();
    if (!classScope) {
      return;
    }
    let text = normalizeWhitespace(getNodeText(node, content));
    text = text.replace(":", "");
    if (text.startsWith("public")) {
      classScope.access = "public";
    }
    if (text.startsWith("protected")) {
      classScope.access = "protected";
    }
    if (text.startsWith("private")) {
      classScope.access = "private";
    }
  };

  const isFunctionDeclaration = (node: SyntaxNode): boolean =>
    Boolean(findDescendantOfType(node, "function_declarator"));

  const visit = (
    node: SyntaxNode,
    templatePrefix?: string
  ): void => {
    switch (node.type) {
      case "template_declaration": {
        const decl =
          node.childForFieldName("declaration") ??
          node.childForFieldName("definition") ??
          node.namedChildren.find((child) =>
            !!child &&
            [
              "function_definition",
              "declaration",
              "class_specifier",
              "struct_specifier",
              "enum_specifier",
              "type_definition",
              "alias_declaration",
              "namespace_definition",
            ].includes(child.type)
          );
        if (decl) {
          const prefix = normalizeWhitespace(
            content.slice(node.startIndex, decl.startIndex)
          );
          visit(decl, prefix || undefined);
          return;
        }
        break;
      }
      case "namespace_definition": {
        handleNamespace(node, templatePrefix);
        return;
      }
      case "class_specifier": {
        handleClass(node, "class", templatePrefix);
        return;
      }
      case "struct_specifier": {
        handleClass(node, "struct", templatePrefix);
        return;
      }
      case "enum_specifier": {
        handleEnum(node, templatePrefix);
        return;
      }
      case "type_definition": {
        handleTypedef(node, templatePrefix);
        return;
      }
      case "alias_declaration": {
        handleAlias(node, templatePrefix);
        return;
      }
      case "function_definition": {
        handleFunction(node, templatePrefix);
        return;
      }
      case "declaration": {
        if (isFunctionDeclaration(node)) {
          handleFunction(node, templatePrefix);
        }
        return;
      }
      case "field_declaration": {
        if (isFunctionDeclaration(node)) {
          handleFunction(node, templatePrefix);
        } else {
          handleField(node);
        }
        return;
      }
      case "access_specifier": {
        handleAccessSpecifier(node);
        return;
      }
      default: {
        break;
      }
    }

    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };

  visit(root);

  return symbols;
}

/**
 * Map internal symbol kinds to our SymbolKind enum.
 */
function mapKind(kind: string): SymbolKind {
  switch (kind) {
    case "class":
    case "struct": {
      return SymbolKind.Class;
    }
    case "interface":
    case "trait": {
      return SymbolKind.Interface;
    }
    case "function": {
      return SymbolKind.Function;
    }
    case "method":
    case "constructor":
    case "destructor": {
      return SymbolKind.Method;
    }
    case "variable":
    case "property": {
      return SymbolKind.Variable;
    }
    case "type":
    case "type_alias": {
      return SymbolKind.Type;
    }
    case "enum": {
      return SymbolKind.Enum;
    }
    case "enum_member": {
      return SymbolKind.Variable;
    }
    case "namespace": {
      return SymbolKind.Class; // Use Class for namespaces
    }
    default: {
      return SymbolKind.Unknown;
    }
  }
}

/**
 * Convert internal symbols to FileSymbol format.
 * Groups children under their parents.
 */
function convertSymbols(internalSymbols: InternalSymbol[]): FileSymbol[] {
  const symbolMap = new Map<string, FileSymbol>();
  const rootSymbols: FileSymbol[] = [];

  // First pass: create all symbols
  for (const is of internalSymbols) {
    const symbol: FileSymbol = {
      name: is.name,
      kind: mapKind(is.kind),
      startLine: is.startLine,
      endLine: is.endLine,
    };

    if (is.signature) {
      symbol.signature = is.signature;
    }

    if (is.exported) {
      symbol.modifiers = ["export"];
    }

    if (is.docstring) {
      symbol.docstring = is.docstring;
    }

    symbol.isExported = is.exported;

    // Store with a key for parent lookup
    symbolMap.set(is.name, symbol);

    if (is.parentName && symbolMap.has(is.parentName)) {
      // Add as child of parent
      const parent = symbolMap.get(is.parentName);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(symbol);
      }
    } else {
      rootSymbols.push(symbol);
    }
  }

  return rootSymbols;
}

/**
 * Generate a file map for C++ files using tree-sitter.
 */
export async function cppMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  const parser = await getWasmParser("cpp");
  if (!parser) return null;
  let tree: Tree | null = null;
  try {
    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // Read file content
    const content = await readFile(filePath, "utf8");

    // Check for abort
    if (signal?.aborted) {
      return null;
    }

    tree = parser.parse(content);
    if (!tree) return null;
    const internalSymbols = extractCppSymbols(tree.rootNode, content);

    if (internalSymbols.length === 0) {
      return null;
    }

    // Convert to FileSymbols
    const symbols = convertSymbols(internalSymbols);
    const totalLines = content.split("\n").length;

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "C++",
      symbols,
      imports: [],
      detailLevel: DetailLevel.Full,
    };
  } catch (err) {
    reportParserError(`wasm:parse:cpp:${err instanceof Error ? err.message : String(err)}`, err, {
      context: "C++ tree-sitter parse failed",
    });
    return null;
  } finally {
    tree?.delete();
    parser.delete();
  }
}
