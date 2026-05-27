import { readFile, stat } from "node:fs/promises";
/**
 * Rust mapper using tree-sitter for AST extraction.
 *
 * Ported from codemap's symbols-rust.ts.
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
  findFirstDescendant,
  finalizeSignature,
} from "./tree-sitter-helpers.js";
export const MAPPER_VERSION = 3;

type ScopeKind = "mod" | "struct" | "enum" | "trait" | "impl";

interface Scope {
  kind: ScopeKind;
  name: string;
  key: string;
  implTarget?: string;
}

interface InternalSymbol {
  name: string;
  kind: string;
  signature?: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  isAsync: boolean;
  isStatic: boolean;
  parentName?: string;
  docstring?: string;
}

function formatSignature(
  node: SyntaxNode,
  source: string,
  opts?: { cutAtParen?: boolean }
): string {
  let text = getNodeText(node, source);
  const braceIndex = text.indexOf("{");
  if (braceIndex !== -1) {
    text = text.slice(0, braceIndex);
  } else if (opts?.cutAtParen) {
    const parenIndex = text.indexOf("(");
    if (parenIndex !== -1) {
      text = text.slice(0, parenIndex);
    }
  }
  return finalizeSignature(text);
}

function hasVisibilityModifier(node: SyntaxNode): boolean {
  return node.namedChildren.some(
    (child: SyntaxNode | null) => child?.type === "visibility_modifier"
  );
}

function extractNameFromField(
  node: SyntaxNode,
  field: string,
  source: string
): string | null {
  const nameNode = node.childForFieldName(field);
  if (!nameNode) {
    return null;
  }
  return normalizeWhitespace(getNodeText(nameNode, source));
}

function extractTypeName(node: SyntaxNode, source: string): string | null {
  switch (node.type) {
    case "type_identifier":
    case "identifier":
    case "self":
    case "super":
    case "crate":
    case "metavariable": {
      return normalizeWhitespace(getNodeText(node, source));
    }
    case "scoped_type_identifier":
    case "scoped_identifier": {
      const pathNode = node.childForFieldName("path");
      const nameNode = node.childForFieldName("name");
      const pathText = pathNode ? extractTypeName(pathNode, source) : null;
      const nameText = nameNode ? extractTypeName(nameNode, source) : null;
      if (!nameText) {
        return pathText;
      }
      return pathText ? `${pathText}::${nameText}` : nameText;
    }
    case "generic_type":
    case "generic_type_with_turbofish": {
      const typeNode = node.childForFieldName("type");
      return typeNode ? extractTypeName(typeNode, source) : null;
    }
    case "reference_type":
    case "pointer_type": {
      const inner = node.childForFieldName("type");
      return inner ? extractTypeName(inner, source) : null;
    }
    default: {
      const candidate = findFirstDescendant(node, [
        "scoped_type_identifier",
        "scoped_identifier",
        "type_identifier",
        "identifier",
      ]);
      return candidate ? extractTypeName(candidate, source) : null;
    }
  }
}

function splitPathParts(text: string): string[] {
  return text
    .split("::")
    .map((part) => part.trim())
    .filter(Boolean);
}

function getModuleKey(scopeStack: Scope[]): string | null {
  for (let i = scopeStack.length - 1; i >= 0; i -= 1) {
    const scope = scopeStack[i];
    if (scope && scope.kind === "mod") {
      return scope.key;
    }
  }
  return null;
}

function normalizeTypePath(path: string, moduleKey: string | null): string {
  const parts = splitPathParts(path);
  const moduleParts = moduleKey ? splitPathParts(moduleKey) : [];

  if (parts.length === 0) {
    return moduleParts.join("::");
  }

  if (parts[0] === "crate") {
    return parts.slice(1).join("::");
  }

  if (parts[0] === "self") {
    return [...moduleParts, ...parts.slice(1)].join("::");
  }

  let superCount = 0;
  while (parts[superCount] === "super") {
    superCount += 1;
  }
  if (superCount > 0) {
    const trimmed = moduleParts.slice(
      0,
      Math.max(0, moduleParts.length - superCount)
    );
    return [...trimmed, ...parts.slice(superCount)].join("::");
  }

  if (moduleParts.length === 0) {
    return parts.join("::");
  }
  return [...moduleParts, ...parts].join("::");
}

/**
 * Extract doc comment (/// or //!) from preceding siblings of a node.
 * Returns the first line of the doc comment, or undefined.
 */
function extractDocComment(
  node: SyntaxNode,
  source: string
): string | undefined {
  const docLines: string[] = [];
  let prev = node.previousNamedSibling;

  // Walk backwards collecting consecutive doc comment lines
  while (prev) {
    if (prev.type === "line_comment") {
      const text = getNodeText(prev, source);
      if (text.startsWith("///")) {
        docLines.unshift(text.replace(/^\/\/\/\s?/, ""));
        prev = prev.previousNamedSibling;
        continue;
      }
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
 * Extract Rust symbols using tree-sitter.
 */
function extractRustSymbols(root: SyntaxNode, content: string): InternalSymbol[] {
  const symbols: InternalSymbol[] = [];
  const scopeStack: Scope[] = [];

  const currentScope = (kind: ScopeKind): Scope | undefined => {
    for (let i = scopeStack.length - 1; i >= 0; i -= 1) {
      const scope = scopeStack[i];
      if (scope && scope.kind === kind) {
        return scope;
      }
    }
    return undefined;
  };

  const addSymbol = (entry: InternalSymbol): void => {
    symbols.push(entry);
  };

  const handleMod = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content);
    const moduleKey = getModuleKey(scopeStack);
    const parentKey = moduleKey ?? undefined;
    const key = parentKey ? `${parentKey}::${name}` : name;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "namespace",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName: parentKey,
      docstring: extractDocComment(node, content),
    });

    const body = node.childForFieldName("body");
    if (!body) {
      return;
    }
    scopeStack.push({ kind: "mod", name, key });
    for (const child of body.namedChildren) {
      if (child) visit(child);
    }
    scopeStack.pop();
  };

  const handleStruct = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content, { cutAtParen: true });
    const moduleKey = getModuleKey(scopeStack);
    const parentKey = moduleKey ?? undefined;
    const key = parentKey ? `${parentKey}::${name}` : name;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "struct",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName: parentKey,
      docstring: extractDocComment(node, content),
    });

    const body = node.childForFieldName("body");
    if (!body) {
      return;
    }
    scopeStack.push({ kind: "struct", name, key });
    for (const child of body.namedChildren) {
      if (child) visit(child);
    }
    scopeStack.pop();
  };

  const handleEnum = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content, { cutAtParen: true });
    const moduleKey = getModuleKey(scopeStack);
    const parentKey = moduleKey ?? undefined;
    const key = parentKey ? `${parentKey}::${name}` : name;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "enum",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName: parentKey,
      docstring: extractDocComment(node, content),
    });

    const body = node.childForFieldName("body");
    if (!body) {
      return;
    }
    scopeStack.push({ kind: "enum", name, key });
    for (const child of body.namedChildren) {
      if (child) visit(child);
    }
    scopeStack.pop();
  };

  const handleTrait = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content);
    const moduleKey = getModuleKey(scopeStack);
    const parentKey = moduleKey ?? undefined;
    const key = parentKey ? `${parentKey}::${name}` : name;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "trait",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName: parentKey,
      docstring: extractDocComment(node, content),
    });

    const body = node.childForFieldName("body");
    if (!body) {
      return;
    }
    scopeStack.push({ kind: "trait", name, key });
    for (const child of body.namedChildren) {
      if (child) visit(child);
    }
    scopeStack.pop();
  };

  const handleImpl = (node: SyntaxNode): void => {
    const typeNode = node.childForFieldName("type");
    if (!typeNode) {
      return;
    }
    const typeName = extractTypeName(typeNode, content);
    if (!typeName) {
      return;
    }
    const moduleKey = getModuleKey(scopeStack);
    const implTarget = normalizeTypePath(typeName, moduleKey);
    const body = node.childForFieldName("body");
    if (!body) {
      return;
    }

    scopeStack.push({
      kind: "impl",
      name: typeName,
      key: implTarget,
      implTarget,
    });
    for (const child of body.namedChildren) {
      if (child) visit(child);
    }
    scopeStack.pop();
  };

  const handleFunction = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content);
    const implScope = currentScope("impl");
    const traitScope = currentScope("trait");
    const moduleKey = getModuleKey(scopeStack);
    const parentName =
      implScope?.implTarget ?? traitScope?.key ?? moduleKey ?? undefined;
    const kind: string = implScope || traitScope ? "method" : "function";
    const { startLine, endLine } = getLineRange(node);
    const isAsync = /\basync\b/.test(signature);

    addSymbol({
      name,
      kind,
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync,
      isStatic: false,
      parentName,
      docstring: extractDocComment(node, content),
    });
  };

  const handleConst = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content);
    const implScope = currentScope("impl");
    const traitScope = currentScope("trait");
    const moduleKey = getModuleKey(scopeStack);
    const parentName =
      implScope?.implTarget ?? traitScope?.key ?? moduleKey ?? undefined;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "variable",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName,
      docstring: extractDocComment(node, content),
    });
  };

  const handleStatic = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content);
    const moduleKey = getModuleKey(scopeStack);
    const parentName = moduleKey ?? undefined;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "variable",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: true,
      parentName,
      docstring: extractDocComment(node, content),
    });
  };

  const handleType = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content);
    const implScope = currentScope("impl");
    const traitScope = currentScope("trait");
    const moduleKey = getModuleKey(scopeStack);
    const parentName =
      implScope?.implTarget ?? traitScope?.key ?? moduleKey ?? undefined;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "type",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName,
      docstring: extractDocComment(node, content),
    });
  };

  const handleMacro = (node: SyntaxNode): void => {
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content, { cutAtParen: true });
    const moduleKey = getModuleKey(scopeStack);
    const parentName = moduleKey ?? undefined;
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "macro",
      signature,
      startLine,
      endLine,
      exported: false,
      isAsync: false,
      isStatic: false,
      parentName,
    });
  };

  const handleField = (node: SyntaxNode): void => {
    const structScope = currentScope("struct");
    if (!structScope) {
      return;
    }
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    const signature = formatSignature(node, content);
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "property",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName: structScope.key,
    });
  };

  const handleEnumVariant = (node: SyntaxNode): void => {
    const enumScope = currentScope("enum");
    if (!enumScope) {
      return;
    }
    const name = extractNameFromField(node, "name", content);
    if (!name) {
      return;
    }
    let signature = normalizeWhitespace(getNodeText(node, content));
    signature = signature.replace(/,\s*$/, "");
    const { startLine, endLine } = getLineRange(node);

    addSymbol({
      name,
      kind: "enum_member",
      signature,
      startLine,
      endLine,
      exported: hasVisibilityModifier(node),
      isAsync: false,
      isStatic: false,
      parentName: enumScope.key,
    });
  };

  const visit = (node: SyntaxNode): void => {
    switch (node.type) {
      case "use_declaration": {
        return;
      }
      case "mod_item": {
        handleMod(node);
        return;
      }
      case "struct_item": {
        handleStruct(node);
        return;
      }
      case "enum_item": {
        handleEnum(node);
        return;
      }
      case "trait_item": {
        handleTrait(node);
        return;
      }
      case "impl_item": {
        handleImpl(node);
        return;
      }
      case "function_item":
      case "function_signature_item": {
        handleFunction(node);
        return;
      }
      case "const_item": {
        handleConst(node);
        return;
      }
      case "static_item": {
        handleStatic(node);
        return;
      }
      case "type_item": {
        handleType(node);
        return;
      }
      case "macro_definition": {
        handleMacro(node);
        return;
      }
      case "field_declaration": {
        handleField(node);
        return;
      }
      case "enum_variant": {
        handleEnumVariant(node);
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
 * Extract use statements for imports list.
 */
function extractUseStatements(root: SyntaxNode, content: string): string[] {
  const imports: string[] = [];

  const visit = (node: SyntaxNode): void => {
    if (node.type === "use_declaration") {
      const arg = node.childForFieldName("argument");
      if (arg) {
        const text = normalizeWhitespace(getNodeText(arg, content));
        imports.push(text);
      }
    }
    for (const child of node.namedChildren) {
      if (child) visit(child);
    }
  };

  visit(root);
  return imports;
}

/**
 * Map internal symbol kinds to our SymbolKind enum.
 */
function mapKind(kind: string): SymbolKind {
  switch (kind) {
    case "struct": {
      return SymbolKind.Class;
    }
    case "trait": {
      return SymbolKind.Interface;
    }
    case "function": {
      return SymbolKind.Function;
    }
    case "method": {
      return SymbolKind.Method;
    }
    case "variable":
    case "property": {
      return SymbolKind.Variable;
    }
    case "type": {
      return SymbolKind.Type;
    }
    case "enum": {
      return SymbolKind.Enum;
    }
    case "enum_member": {
      return SymbolKind.Variable;
    }
    case "namespace": {
      return SymbolKind.Class; // mod as namespace
    }
    case "macro": {
      return SymbolKind.Function;
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

    const modifiers: string[] = [];
    if (is.isAsync) {
      modifiers.push("async");
    }
    if (is.isStatic) {
      modifiers.push("static");
    }
    if (is.exported) {
      modifiers.push("pub");
    }

    if (modifiers.length > 0) {
      symbol.modifiers = modifiers;
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
 * Generate a file map for Rust content provided in-memory.
 * Bypasses all disk I/O; filePath is used only for path identity.
 */
export async function rustMapperFromContent(
  filePath: string,
  content: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  const parser = await getWasmParser("rust");
  if (!parser) return null;
  let tree: Tree | null = null;
  try {
    if (signal?.aborted) return null;
    tree = parser.parse(content);
    if (!tree) return null;
    const internalSymbols = extractRustSymbols(tree.rootNode, content);
    if (internalSymbols.length === 0) return null;

    const symbols = convertSymbols(internalSymbols);
    const imports = extractUseStatements(tree.rootNode, content);
    const totalLines = content.split("\n").length;
    const totalBytes = Buffer.byteLength(content, "utf8");

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "Rust",
      symbols,
      imports,
      detailLevel: DetailLevel.Full,
    };
  } catch (err) {
    reportParserError(`wasm:parse:rust:${err instanceof Error ? err.message : String(err)}`, err, {
      context: "Rust tree-sitter parse failed",
    });
    return null;
  } finally {
    tree?.delete();
    parser.delete();
  }
}

/**
 * Generate a file map for Rust files using tree-sitter.
 */
export async function rustMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  const parser = await getWasmParser("rust");
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
    const internalSymbols = extractRustSymbols(tree.rootNode, content);
    if (internalSymbols.length === 0) {
      return null;
    }

    const symbols = convertSymbols(internalSymbols);
    const imports = extractUseStatements(tree.rootNode, content);
    const totalLines = content.split("\n").length;

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "Rust",
      symbols,
      imports,
      detailLevel: DetailLevel.Full,
    };
  } catch (err) {
    reportParserError(`wasm:parse:rust:${err instanceof Error ? err.message : String(err)}`, err, {
      context: "Rust tree-sitter parse failed",
    });
    return null;
  } finally {
    tree?.delete();
    parser.delete();
  }
}
