/**
 * TypeScript/JavaScript mapper using ts-morph for AST extraction.
 *
 * Replaces the codemap CLI subprocess with direct ts-morph parsing.
 */
import { readFile, stat } from "node:fs/promises";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

// Lazy load ts-morph to avoid startup cost when not needed
let tsMorphModule: typeof import("ts-morph") | null = null;
let project: import("ts-morph").Project | null = null;
let virtualCounter = 0;

async function loadTsMorph(): Promise<typeof import("ts-morph")> {
  if (!tsMorphModule) {
    tsMorphModule = await import("ts-morph");
  }
  return tsMorphModule;
}

function getProject(ts: typeof import("ts-morph")): import("ts-morph").Project {
  if (!project) {
    project = new ts.Project({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        target: ts.ts.ScriptTarget.ESNext,
        module: ts.ts.ModuleKind.ESNext,
        strict: false,
        skipLibCheck: true,
        noEmit: true,
      },
      useInMemoryFileSystem: true,
      skipLoadingLibFiles: true,
    });
  }
  return project;
}

function cleanupSignature(sig: string): string {
  return sig.replaceAll(/import\([^)]+\)\./g, "");
}

function getFunctionSignature(
  ts: typeof import("ts-morph"),
  node:
    | import("ts-morph").FunctionDeclaration
    | import("ts-morph").MethodDeclaration
    | import("ts-morph").ConstructorDeclaration
    | import("ts-morph").GetAccessorDeclaration
    | import("ts-morph").SetAccessorDeclaration
    | import("ts-morph").ArrowFunction
    | import("ts-morph").FunctionExpression
): string {
  const { Node } = ts;

  if (Node.isConstructorDeclaration(node)) {
    const params = node
      .getParameters()
      .map((p) => p.getText())
      .join(", ");
    return cleanupSignature(`constructor(${params})`);
  }

  if (Node.isGetAccessorDeclaration(node)) {
    const returnType = node.getReturnType().getText();
    return cleanupSignature(`get ${node.getName()}(): ${returnType}`);
  }

  if (Node.isSetAccessorDeclaration(node)) {
    const params = node
      .getParameters()
      .map((p) => p.getText())
      .join(", ");
    return cleanupSignature(`set ${node.getName()}(${params})`);
  }

  const name =
    Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)
      ? (node.getName() ?? "anonymous")
      : "anonymous";

  const typeParams =
    Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node)
      ? node
          .getTypeParameters()
          .map((p) => p.getText())
          .join(", ")
      : "";
  const typeParamsStr = typeParams ? `<${typeParams}>` : "";

  const params = node
    .getParameters()
    .map((p) => p.getText())
    .join(", ");

  let returnType = "";
  try {
    const retType = node.getReturnType();
    returnType = retType ? `: ${retType.getText()}` : "";
  } catch {
    returnType = "";
  }

  const asyncPrefix = node.isAsync?.() ? "async " : "";
  const generatorPrefix =
    Node.isFunctionDeclaration(node) && node.isGenerator() ? "*" : "";

  return cleanupSignature(
    `${asyncPrefix}${generatorPrefix}${name}${typeParamsStr}(${params})${returnType}`
  );
}

function getVariableSignature(
  ts: typeof import("ts-morph"),
  varDecl: import("ts-morph").VariableDeclaration
): string | undefined {
  const { Node } = ts;
  const init = varDecl.getInitializer();

  if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
    const params = init
      .getParameters()
      .map((p) => p.getText())
      .join(", ");
    let returnStr = "";
    try {
      const retType = init.getReturnType();
      returnStr = retType ? `: ${retType.getText()}` : "";
    } catch {
      returnStr = "";
    }
    const asyncPrefix = init.isAsync() ? "async " : "";
    return cleanupSignature(`${asyncPrefix}(${params})${returnStr}`);
  }

  const typeNode = varDecl.getTypeNode();
  if (typeNode) {
    return cleanupSignature(typeNode.getText());
  }

  let typeText = "";
  try {
    typeText = varDecl.getType().getText();
  } catch {
    typeText = "";
  }
  if (typeText.length > 100) {
    return undefined;
  }
  if (!typeText) {
    return undefined;
  }
  return cleanupSignature(typeText);
}

function getTypeSignature(
  node: import("ts-morph").TypeAliasDeclaration
): string {
  const typeParams = node
    .getTypeParameters()
    .map((p) => p.getText())
    .join(", ");
  const typeParamsStr = typeParams ? `<${typeParams}>` : "";
  const typeText = node.getTypeNode()?.getText() ?? "";
  const maxLen = 200;
  const truncated =
    typeText.length > maxLen ? `${typeText.slice(0, maxLen)}...` : typeText;
  return cleanupSignature(`${node.getName()}${typeParamsStr} = ${truncated}`);
}

function getInterfaceSignature(
  node: import("ts-morph").InterfaceDeclaration
): string {
  const typeParams = node
    .getTypeParameters()
    .map((p) => p.getText())
    .join(", ");
  const typeParamsStr = typeParams ? `<${typeParams}>` : "";
  const extendsClause = node
    .getExtends()
    .map((e) => e.getText())
    .join(", ");
  const extendsStr = extendsClause ? ` extends ${extendsClause}` : "";
  return cleanupSignature(`${node.getName()}${typeParamsStr}${extendsStr}`);
}

function getClassSignature(node: import("ts-morph").ClassDeclaration): string {
  const name = node.getName() ?? "anonymous";
  const typeParams = node
    .getTypeParameters()
    .map((p) => p.getText())
    .join(", ");
  const typeParamsStr = typeParams ? `<${typeParams}>` : "";
  const extendsClause = node.getExtends()?.getText();
  const extendsStr = extendsClause ? ` extends ${extendsClause}` : "";
  const implementsClause = node
    .getImplements()
    .map((i) => i.getText())
    .join(", ");
  const implementsStr = implementsClause
    ? ` implements ${implementsClause}`
    : "";
  return cleanupSignature(
    `${name}${typeParamsStr}${extendsStr}${implementsStr}`
  );
}

function getEnumSignature(node: import("ts-morph").EnumDeclaration): string {
  const members = node.getMembers().map((m) => m.getName());
  if (members.length <= 5) {
    return `${node.getName()} { ${members.join(", ")} }`;
  }
  return `${node.getName()} { ${members.slice(0, 5).join(", ")}, ... }`;
}

function getPropertySignature(
  node: import("ts-morph").PropertyDeclaration
): string {
  const name = node.getName();
  const optional = node.hasQuestionToken() ? "?" : "";
  const typeNode = node.getTypeNode();
  const typeStr = typeNode ? `: ${typeNode.getText()}` : "";
  return `${name}${optional}${typeStr}`;
}

function isVariableExported(
  varDecl: import("ts-morph").VariableDeclaration
): boolean {
  const statement = varDecl.getVariableStatement();
  return statement?.isExported() ?? false;
}

function isVariableDefaultExport(
  varDecl: import("ts-morph").VariableDeclaration
): boolean {
  const statement = varDecl.getVariableStatement();
  return statement?.isDefaultExport() ?? false;
}

function isVariableAsync(
  ts: typeof import("ts-morph"),
  varDecl: import("ts-morph").VariableDeclaration
): boolean {
  const { Node } = ts;
  const init = varDecl.getInitializer();
  if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
    return init.isAsync();
  }
  return false;
}

interface InternalSymbol {
  name: string;
  kind: string;
  signature?: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  isDefault: boolean;
  isAsync: boolean;
  isStatic: boolean;
  isAbstract: boolean;
  parentName?: string;
  docstring?: string;
}

/**
 * Extract the first line of a JSDoc comment from a node.
 */
function getDocstring(
  node: import("ts-morph").JSDocableNode
): string | undefined {
  const docs = node.getJsDocs();
  if (docs.length === 0) {
    return undefined;
  }
  const [firstDoc] = docs;
  if (!firstDoc) {
    return undefined;
  }
  const text = firstDoc.getDescription().trim();
  if (!text) {
    return undefined;
  }
  const firstLine = text.split("\n")[0]?.trim();
  return firstLine || undefined;
}

function extractSymbols(
  ts: typeof import("ts-morph"),
  sourceFile: import("ts-morph").SourceFile
): InternalSymbol[] {
  const symbols: InternalSymbol[] = [];

  for (const func of sourceFile.getFunctions()) {
    symbols.push({
      name: func.getName() ?? "default",
      kind: "function",
      signature: getFunctionSignature(ts, func),
      startLine: func.getStartLineNumber(),
      endLine: func.getEndLineNumber(),
      exported: func.isExported() || func.isDefaultExport(),
      isDefault: func.isDefaultExport(),
      isAsync: func.isAsync(),
      isStatic: false,
      isAbstract: false,
      docstring: getDocstring(func),
    });
  }

  for (const cls of sourceFile.getClasses()) {
    const className = cls.getName() ?? "default";
    symbols.push({
      name: className,
      kind: "class",
      signature: getClassSignature(cls),
      startLine: cls.getStartLineNumber(),
      endLine: cls.getEndLineNumber(),
      exported: cls.isExported() || cls.isDefaultExport(),
      isDefault: cls.isDefaultExport(),
      isAsync: false,
      isStatic: false,
      isAbstract: cls.isAbstract(),
      docstring: getDocstring(cls),
    });

    for (const ctor of cls.getConstructors()) {
      symbols.push({
        name: "constructor",
        kind: "constructor",
        signature: getFunctionSignature(ts, ctor),
        startLine: ctor.getStartLineNumber(),
        endLine: ctor.getEndLineNumber(),
        exported: false,
        isDefault: false,
        isAsync: false,
        isStatic: false,
        isAbstract: false,
        parentName: className,
      });
    }

    for (const method of cls.getMethods()) {
      symbols.push({
        name: method.getName(),
        kind: "method",
        signature: getFunctionSignature(ts, method),
        startLine: method.getStartLineNumber(),
        endLine: method.getEndLineNumber(),
        exported: false,
        isDefault: false,
        isAsync: method.isAsync(),
        isStatic: method.isStatic(),
        isAbstract: method.isAbstract(),
        parentName: className,
        docstring: getDocstring(method),
      });
    }

    for (const prop of cls.getProperties()) {
      symbols.push({
        name: prop.getName(),
        kind: "property",
        signature: getPropertySignature(prop),
        startLine: prop.getStartLineNumber(),
        endLine: prop.getEndLineNumber(),
        exported: false,
        isDefault: false,
        isAsync: false,
        isStatic: prop.isStatic(),
        isAbstract: prop.isAbstract(),
        parentName: className,
      });
    }

    for (const getter of cls.getGetAccessors()) {
      symbols.push({
        name: getter.getName(),
        kind: "getter",
        signature: getFunctionSignature(ts, getter),
        startLine: getter.getStartLineNumber(),
        endLine: getter.getEndLineNumber(),
        exported: false,
        isDefault: false,
        isAsync: false,
        isStatic: getter.isStatic(),
        isAbstract: getter.isAbstract(),
        parentName: className,
      });
    }

    for (const setter of cls.getSetAccessors()) {
      symbols.push({
        name: setter.getName(),
        kind: "setter",
        signature: getFunctionSignature(ts, setter),
        startLine: setter.getStartLineNumber(),
        endLine: setter.getEndLineNumber(),
        exported: false,
        isDefault: false,
        isAsync: false,
        isStatic: setter.isStatic(),
        isAbstract: setter.isAbstract(),
        parentName: className,
      });
    }
  }

  for (const iface of sourceFile.getInterfaces()) {
    symbols.push({
      name: iface.getName(),
      kind: "interface",
      signature: getInterfaceSignature(iface),
      startLine: iface.getStartLineNumber(),
      endLine: iface.getEndLineNumber(),
      exported: iface.isExported() || iface.isDefaultExport(),
      isDefault: iface.isDefaultExport(),
      isAsync: false,
      isStatic: false,
      isAbstract: false,
      docstring: getDocstring(iface),
    });
  }

  for (const typeAlias of sourceFile.getTypeAliases()) {
    symbols.push({
      name: typeAlias.getName(),
      kind: "type",
      signature: getTypeSignature(typeAlias),
      startLine: typeAlias.getStartLineNumber(),
      endLine: typeAlias.getEndLineNumber(),
      exported: typeAlias.isExported() || typeAlias.isDefaultExport(),
      isDefault: typeAlias.isDefaultExport(),
      isAsync: false,
      isStatic: false,
      isAbstract: false,
      docstring: getDocstring(typeAlias),
    });
  }

  for (const enumDecl of sourceFile.getEnums()) {
    const enumName = enumDecl.getName();
    symbols.push({
      name: enumName,
      kind: "enum",
      signature: getEnumSignature(enumDecl),
      startLine: enumDecl.getStartLineNumber(),
      endLine: enumDecl.getEndLineNumber(),
      exported: enumDecl.isExported() || enumDecl.isDefaultExport(),
      isDefault: enumDecl.isDefaultExport(),
      isAsync: false,
      isStatic: false,
      isAbstract: false,
      docstring: getDocstring(enumDecl),
    });

    for (const member of enumDecl.getMembers()) {
      const value = member.getValue();
      const valueStr = value === undefined ? "" : ` = ${JSON.stringify(value)}`;
      symbols.push({
        name: member.getName(),
        kind: "enum_member",
        signature: `${member.getName()}${valueStr}`,
        startLine: member.getStartLineNumber(),
        endLine: member.getEndLineNumber(),
        exported: false,
        isDefault: false,
        isAsync: false,
        isStatic: false,
        isAbstract: false,
        parentName: enumName,
      });
    }
  }

  for (const varStatement of sourceFile.getVariableStatements()) {
    const statementDocstring = getDocstring(varStatement);
    for (const varDecl of varStatement.getDeclarations()) {
      const signature = getVariableSignature(ts, varDecl) ?? varDecl.getName();
      symbols.push({
        name: varDecl.getName(),
        kind: "variable",
        signature,
        startLine: varDecl.getStartLineNumber(),
        endLine: varDecl.getEndLineNumber(),
        exported: isVariableExported(varDecl),
        isDefault: isVariableDefaultExport(varDecl),
        isAsync: isVariableAsync(ts, varDecl),
        isStatic: false,
        isAbstract: false,
        docstring: statementDocstring,
      });
    }
  }

  return symbols;
}

function collectExportNames(
  ts: typeof import("ts-morph"),
  sourceFile: import("ts-morph").SourceFile
): {
  exportedNames: Set<string>;
  defaultNames: Set<string>;
} {
  const { Node } = ts;
  const exportedNames = new Set<string>();
  const defaultNames = new Set<string>();

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    for (const decl of declarations) {
      if (decl.getSourceFile() !== sourceFile) {
        continue;
      }
      exportedNames.add(name);
    }
  }

  for (const exportDecl of sourceFile.getExportDeclarations()) {
    if (exportDecl.getModuleSpecifierValue()) {
      continue;
    }
    for (const named of exportDecl.getNamedExports()) {
      const localName = named.getName();
      exportedNames.add(localName);
      if (named.getAliasNode()?.getText() === "default") {
        defaultNames.add(localName);
      }
    }
  }

  for (const assign of sourceFile.getExportAssignments()) {
    const expr = assign.getExpression();
    if (Node.isIdentifier(expr)) {
      exportedNames.add(expr.getText());
      if (!assign.isExportEquals()) {
        defaultNames.add(expr.getText());
      }
    }
  }

  return { exportedNames, defaultNames };
}

function applyExportFlags(
  symbols: InternalSymbol[],
  exportedNames: Set<string>,
  defaultNames: Set<string>
): void {
  for (const sym of symbols) {
    if (sym.parentName) {
      continue;
    }
    if (exportedNames.has(sym.name)) {
      sym.exported = true;
    }
    if (defaultNames.has(sym.name)) {
      sym.isDefault = true;
      sym.exported = true;
    }
  }
}

function extractImports(sourceFile: import("ts-morph").SourceFile): string[] {
  const modules: string[] = [];
  const seen = new Set<string>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const source = importDecl.getModuleSpecifierValue();
    if (source && !seen.has(source)) {
      seen.add(source);
      modules.push(source);
    }
  }

  return modules;
}

/**
 * Map internal symbol kinds to our SymbolKind enum.
 */
function mapKind(kind: string): SymbolKind {
  switch (kind) {
    case "class": {
      return SymbolKind.Class;
    }
    case "interface": {
      return SymbolKind.Interface;
    }
    case "function": {
      return SymbolKind.Function;
    }
    case "method":
    case "constructor":
    case "getter":
    case "setter": {
      return SymbolKind.Method;
    }
    case "variable":
    case "const":
    case "let":
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
    if (is.isAbstract) {
      modifiers.push("abstract");
    }
    if (is.exported) {
      modifiers.push("export");
    }
    if (is.isDefault) {
      modifiers.push("default");
    }

    if (modifiers.length > 0) {
      symbol.modifiers = modifiers;
    }

    if (is.docstring) {
      symbol.docstring = is.docstring;
    }

    symbol.isExported = is.exported;
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
 * Get display name for language.
 */
function getLanguageDisplayName(filePath: string): string {
  if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
    return "TypeScript";
  }
  if (filePath.endsWith(".mts") || filePath.endsWith(".cts")) {
    return "TypeScript";
  }
  return "JavaScript";
}

/**
 * Generate a file map for TypeScript/JavaScript files using ts-morph.
 */
export async function typescriptMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    // Load ts-morph lazily
    const ts = await loadTsMorph();

    const stats = await stat(filePath);
    const totalBytes = stats.size;

    // Read file content
    const content = await readFile(filePath, "utf8");

    // Check for abort
    if (signal?.aborted) {
      return null;
    }

    // Parse with ts-morph
    const proj = getProject(ts);
    const vpath = `virtual_${virtualCounter++}_${filePath.replaceAll("\\", "/")}`;
    const sourceFile = proj.createSourceFile(vpath, content, {
      overwrite: true,
    });

    try {
      const rawSymbols = extractSymbols(ts, sourceFile);
      const { exportedNames, defaultNames } = collectExportNames(
        ts,
        sourceFile
      );
      applyExportFlags(rawSymbols, exportedNames, defaultNames);

      const symbols = convertSymbols(rawSymbols);
      const imports = extractImports(sourceFile);
      const totalLines = content.split("\n").length;

      return {
        path: filePath,
        totalLines,
        totalBytes,
        language: getLanguageDisplayName(filePath),
        symbols,
        imports,
        detailLevel: DetailLevel.Full,
      };
    } finally {
      proj.removeSourceFile(sourceFile);
    }
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`TypeScript mapper failed: ${error}`);
    return null;
  }
}
