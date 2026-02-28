import { readFile, stat } from "node:fs/promises";
/**
 * Clojure mapper using tree-sitter for AST extraction.
 *
 * The tree-sitter-clojure grammar parses at the S-expression level:
 * all forms are `list_lit` nodes. We identify def forms by matching
 * the first `sym_lit` child against known Clojure special forms.
 */
import { createRequire } from "node:module";

import type { FileMap, FileSymbol } from "../types.js";

import { DetailLevel, SymbolKind } from "../enums.js";

type SyntaxNode = import("tree-sitter").SyntaxNode;

/**
 * Def forms we recognize and how they map to symbol kinds.
 */
const DEF_FORMS: Record<
  string,
  { kind: SymbolKind; isPrivate?: boolean; hasChildren?: boolean }
> = {
  defn: { kind: SymbolKind.Function },
  "defn-": { kind: SymbolKind.Function, isPrivate: true },
  def: { kind: SymbolKind.Variable },
  defonce: { kind: SymbolKind.Variable },
  defmacro: { kind: SymbolKind.Function },
  defmulti: { kind: SymbolKind.Function },
  defmethod: { kind: SymbolKind.Method },
  defprotocol: { kind: SymbolKind.Interface, hasChildren: true },
  defrecord: { kind: SymbolKind.Class },
  deftype: { kind: SymbolKind.Class },
};

// Lazy-loaded parser
let parser: import("tree-sitter") | null = null;
let parserInitialized = false;

function ensureWritableTypeProperty(parserCtor: unknown): void {
  const syntaxNode = (parserCtor as { SyntaxNode?: { prototype?: object } })
    .SyntaxNode;
  const proto = syntaxNode?.prototype;
  if (!proto) {
    return;
  }
  const desc = Object.getOwnPropertyDescriptor(proto, "type");
  if (!desc || desc.set) {
    return;
  }
  Object.defineProperty(proto, "type", { ...desc, set: () => {} });
}

function getParser(): import("tree-sitter") | null {
  if (parserInitialized) {
    return parser;
  }

  parserInitialized = true;

  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
  if (isBun) {
    return null;
  }

  try {
    const require = createRequire(import.meta.url);
    const ParserCtor = require("tree-sitter") as typeof import("tree-sitter");
    const Clojure =
      require("tree-sitter-clojure") as import("tree-sitter").Language;
    ensureWritableTypeProperty(ParserCtor);
    parser = new ParserCtor();
    parser.setLanguage(Clojure);
    return parser;
  } catch {
    return null;
  }
}

function getNodeText(node: SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

/**
 * Get the text of a sym_lit's sym_name child.
 */
function getSymName(node: SyntaxNode, source: string): string | null {
  if (node.type !== "sym_lit") {
    return null;
  }
  const nameNode = node.namedChildren.find((c) => c.type === "sym_name");
  if (!nameNode) {
    return null;
  }
  return getNodeText(nameNode, source);
}

/**
 * Check if a sym_lit has ^:private metadata.
 */
function hasPrivateMeta(node: SyntaxNode): boolean {
  return node.namedChildren.some(
    (c) =>
      c.type === "meta_lit" &&
      c.namedChildren.some((v) => v.type === "kwd_lit" && v.text === ":private")
  );
}

/**
 * Extract the string content from a str_lit node (strips surrounding quotes).
 */
function extractString(node: SyntaxNode, source: string): string {
  const text = getNodeText(node, source);
  return text.slice(1, -1);
}

/**
 * Extract the named values from a list_lit (skipping gaps/whitespace).
 */
function getValueChildren(node: SyntaxNode): SyntaxNode[] {
  return node.namedChildren.filter(
    (c) => c.type !== "comment" && c.type !== "dis_expr"
  );
}

/**
 * Extract protocol method signatures from a defprotocol body.
 */
function extractProtocolMethods(
  children: SyntaxNode[],
  source: string
): FileSymbol[] {
  const methods: FileSymbol[] = [];
  for (const child of children) {
    if (child.type !== "list_lit") {
      continue;
    }
    const values = getValueChildren(child);
    const [firstValue] = values;
    if (!firstValue || firstValue.type !== "sym_lit") {
      continue;
    }
    const name = getSymName(firstValue, source);
    if (!name) {
      continue;
    }

    const paramsNode = values.find((v) => v.type === "vec_lit");
    const params = paramsNode ? getNodeText(paramsNode, source) : "";
    const signature = params ? `(${name} ${params})` : `(${name})`;

    const docNode = values.find(
      (v, i) =>
        v.type === "str_lit" && i > values.indexOf(paramsNode ?? firstValue)
    );

    methods.push({
      name,
      kind: SymbolKind.Method,
      startLine: child.startPosition.row + 1,
      endLine: child.endPosition.row + 1,
      signature,
      ...(docNode ? { docstring: extractString(docNode, source) } : {}),
    });
  }
  return methods;
}

/**
 * Extract a defmethod form into an ExtractedDef-like result.
 */
function extractDefmethod(
  node: SyntaxNode,
  values: SyntaxNode[],
  source: string
): FileSymbol | null {
  const [, nameNode, dispatchNode] = values;
  if (!nameNode || nameNode.type !== "sym_lit") {
    return null;
  }
  const multiName = getSymName(nameNode, source);
  if (!multiName) {
    return null;
  }

  const dispatchVal = dispatchNode
    ? getNodeText(dispatchNode, source)
    : "unknown";

  const paramsNode = values.find((v) => v.type === "vec_lit");
  const params = paramsNode ? getNodeText(paramsNode, source) : "";
  const signature = `(defmethod ${multiName} ${dispatchVal} ${params})`;

  return {
    name: `${multiName} ${dispatchVal}`,
    kind: SymbolKind.Method,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    signature,
    isExported: true,
  };
}

/**
 * Extract docstring from values after the name.
 *
 * For function-like forms (defn, defmacro, defprotocol, defmulti):
 *   docstring is the first str_lit that appears before any vec_lit or list_lit.
 *
 * For value forms (def, defonce):
 *   a str_lit is a docstring only if another value follows it.
 *   e.g. (def x "doc" 42) → docstring="doc", but (def x "val") → no docstring.
 */
function extractDocstring(
  restValues: SyntaxNode[],
  source: string,
  isValueForm: boolean
): string | undefined {
  const firstStr = restValues.find((v) => v.type === "str_lit");
  if (!firstStr) {
    return undefined;
  }
  const firstVec = restValues.find((v) => v.type === "vec_lit");
  const firstList = restValues.find((v) => v.type === "list_lit");

  const strIdx = restValues.indexOf(firstStr);
  const vecIdx = firstVec ? restValues.indexOf(firstVec) : Infinity;
  const listIdx = firstList ? restValues.indexOf(firstList) : Infinity;

  if (strIdx >= vecIdx || strIdx >= listIdx) {
    return undefined;
  }

  // For def/defonce: the string is a docstring only if a value follows it
  if (isValueForm) {
    const hasValueAfter = restValues.some(
      (v, i) => i > strIdx && v.type !== "comment" && v.type !== "dis_expr"
    );
    if (!hasValueAfter) {
      return undefined;
    }
  }

  return extractString(firstStr, source);
}

/**
 * Build signature for function-like forms (defn, defn-, defmacro).
 */
function buildFnSignature(
  formName: string,
  name: string,
  restValues: SyntaxNode[],
  source: string
): string {
  const firstVec = restValues.find((v) => v.type === "vec_lit");
  if (firstVec) {
    return `(${formName} ${name} ${getNodeText(firstVec, source)})`;
  }

  // Multi-arity: look for list_lit children starting with vec_lit
  const arities = restValues.filter(
    (v) =>
      v.type === "list_lit" &&
      getValueChildren(v).some((c) => c.type === "vec_lit")
  );
  if (arities.length > 0) {
    const arityStrs = arities.map((a) => {
      const vec = getValueChildren(a).find((c) => c.type === "vec_lit");
      return vec ? getNodeText(vec, source) : "[]";
    });
    return `(${formName} ${name} ${arityStrs.join(" ")})`;
  }

  return `(${formName} ${name})`;
}

/**
 * Build signature for non-function def forms.
 */
function buildDefSignature(
  formName: string,
  name: string,
  restValues: SyntaxNode[],
  source: string
): string {
  if (formName === "defmulti") {
    const dispatchNode = restValues.find((v) => v.type !== "str_lit");
    const dispatch = dispatchNode ? getNodeText(dispatchNode, source) : "";
    return dispatch ? `(defmulti ${name} ${dispatch})` : `(defmulti ${name})`;
  }

  if (formName === "defprotocol") {
    return `(defprotocol ${name})`;
  }

  if (formName === "defrecord" || formName === "deftype") {
    const firstVec = restValues.find((v) => v.type === "vec_lit");
    return firstVec
      ? `(${formName} ${name} ${getNodeText(firstVec, source)})`
      : `(${formName} ${name})`;
  }

  // def, defonce
  return `(${formName} ${name})`;
}

const FN_FORMS = new Set(["defn", "defn-", "defmacro"]);

/**
 * Try to extract a def form from a list_lit node.
 */
function extractDef(node: SyntaxNode, source: string): FileSymbol | null {
  if (node.type !== "list_lit") {
    return null;
  }

  const values = getValueChildren(node);
  if (values.length < 2) {
    return null;
  }

  const [formNode, nameNode] = values;
  if (!formNode || formNode.type !== "sym_lit") {
    return null;
  }
  const formName = getSymName(formNode, source);
  if (!formName) {
    return null;
  }

  const defInfo = DEF_FORMS[formName];
  if (!defInfo) {
    return null;
  }

  // defmethod has unique structure
  if (formName === "defmethod") {
    return extractDefmethod(node, values, source);
  }

  if (!nameNode || nameNode.type !== "sym_lit") {
    return null;
  }
  const name = getSymName(nameNode, source);
  if (!name) {
    return null;
  }

  const isPrivate = defInfo.isPrivate === true || hasPrivateMeta(nameNode);
  const modifiers: string[] = [];
  if (isPrivate) {
    modifiers.push("private");
  }
  if (formName === "defmacro") {
    modifiers.push("macro");
  }

  const restValues = values.slice(2);
  const isValueForm = formName === "def" || formName === "defonce";
  const docstring = extractDocstring(restValues, source, isValueForm);

  const signature = FN_FORMS.has(formName)
    ? buildFnSignature(formName, name, restValues, source)
    : buildDefSignature(formName, name, restValues, source);

  // Only defprotocol has extractable method children.
  // defrecord/deftype inline protocol methods are not yet extracted.
  let children: FileSymbol[] | undefined;
  if (defInfo.hasChildren && formName === "defprotocol") {
    const extracted = extractProtocolMethods(restValues, source);
    children = extracted.length > 0 ? extracted : undefined;
  }

  const symbol: FileSymbol = {
    name,
    kind: defInfo.kind,
    startLine: node.startPosition.row + 1,
    endLine: node.endPosition.row + 1,
    isExported: !isPrivate,
  };

  if (signature) {
    symbol.signature = signature;
  }
  if (docstring) {
    symbol.docstring = docstring;
  }
  if (modifiers.length > 0) {
    symbol.modifiers = modifiers;
  }
  if (children) {
    symbol.children = children;
  }

  return symbol;
}

/**
 * Extract ns form for namespace and imports.
 */
function extractNs(
  node: SyntaxNode,
  source: string
): { namespace: string; imports: string[]; docstring?: string } | null {
  if (node.type !== "list_lit") {
    return null;
  }

  const values = getValueChildren(node);
  if (values.length < 2) {
    return null;
  }

  const [formNode, nameNode, docNode] = values;
  if (!formNode || formNode.type !== "sym_lit") {
    return null;
  }
  if (getSymName(formNode, source) !== "ns") {
    return null;
  }

  if (!nameNode || nameNode.type !== "sym_lit") {
    return null;
  }
  const namespace = getSymName(nameNode, source);
  if (!namespace) {
    return null;
  }

  // Docstring at index 2
  let docstring: string | undefined;
  if (docNode?.type === "str_lit") {
    docstring = extractString(docNode, source);
  }

  // Extract :require and :import clauses
  const imports: string[] = [];
  for (const child of values) {
    if (child.type !== "list_lit") {
      continue;
    }
    const listValues = getValueChildren(child);
    const [kwd] = listValues;
    if (!kwd || kwd.type !== "kwd_lit") {
      continue;
    }
    const kwdText = getNodeText(kwd, source);
    if (kwdText === ":require" || kwdText === ":import") {
      for (const spec of listValues.slice(1)) {
        // Unwrap reader conditionals inside require/import:
        // #?(:clj [clojure.java.io] :cljs [cljs.reader])
        // → each platform's specs get added with a platform tag
        if (
          spec.type === "read_cond_lit" ||
          spec.type === "splicing_read_cond_lit"
        ) {
          const rcChildren = getValueChildren(spec);
          let platform: string | undefined;
          for (const rc of rcChildren) {
            if (rc.type === "kwd_lit") {
              platform = getNodeText(rc, source);
              continue;
            }
            if (platform) {
              imports.push(`${getNodeText(rc, source)} ${platform}`);
              platform = undefined;
            }
          }
        } else {
          imports.push(getNodeText(spec, source));
        }
      }
    }
  }

  return { namespace, imports, docstring };
}

/**
 * Extract def forms from a reader conditional (#? or #?@).
 *
 * Reader conditionals contain kwd_lit/form pairs like:
 *   #?(:clj (defn foo [x] ...) :cljs (defn foo [x] ...))
 *
 * We extract defs from all platform branches, annotating each with
 * its platform keyword as a modifier. When the same name appears in
 * multiple branches, all variants are included — the map consumer
 * sees the full picture.
 */
function extractReaderConditionalDefs(
  node: SyntaxNode,
  source: string
): FileSymbol[] {
  const results: FileSymbol[] = [];
  const children = getValueChildren(node);

  // Children alternate: kwd_lit, form, kwd_lit, form, ...
  let currentPlatform: string | undefined;
  for (const child of children) {
    if (child.type === "kwd_lit") {
      currentPlatform = getNodeText(child, source);
      continue;
    }

    if (child.type === "list_lit") {
      const def = extractDef(child, source);
      if (def && currentPlatform) {
        const platformName = currentPlatform.replace(/^:/, "");
        const platformMod = `platform-${platformName}`;
        def.modifiers = def.modifiers
          ? [...def.modifiers, platformMod]
          : [platformMod];
        results.push(def);
      }
    }
  }

  return results;
}

/**
 * Generate a file map for Clojure files using tree-sitter.
 */
export async function clojureMapper(
  filePath: string,
  signal?: AbortSignal
): Promise<FileMap | null> {
  try {
    const p = getParser();
    if (!p) {
      return null;
    }

    const stats = await stat(filePath);
    const totalBytes = stats.size;

    const content = await readFile(filePath, "utf8");

    if (signal?.aborted) {
      return null;
    }

    let tree: import("tree-sitter").Tree;
    try {
      tree = p.parse(content);
    } catch {
      return null;
    }

    const symbols: FileSymbol[] = [];
    const imports: string[] = [];

    for (const child of tree.rootNode.namedChildren) {
      // Reader conditionals: extract defs from all platform branches
      if (
        child.type === "read_cond_lit" ||
        child.type === "splicing_read_cond_lit"
      ) {
        const condDefs = extractReaderConditionalDefs(child, content);
        symbols.push(...condDefs);
        continue;
      }

      if (child.type !== "list_lit") {
        continue;
      }

      const ns = extractNs(child, content);
      if (ns) {
        imports.push(...ns.imports);

        symbols.push({
          name: ns.namespace,
          kind: SymbolKind.Namespace,
          startLine: child.startPosition.row + 1,
          endLine: child.endPosition.row + 1,
          signature: `(ns ${ns.namespace})`,
          ...(ns.docstring ? { docstring: ns.docstring } : {}),
          isExported: true,
        });
        continue;
      }

      const def = extractDef(child, content);
      if (def) {
        symbols.push(def);
      }
    }

    if (symbols.length === 0) {
      return null;
    }

    const totalLines = content.split("\n").length;

    return {
      path: filePath,
      totalLines,
      totalBytes,
      language: "Clojure",
      symbols,
      imports,
      detailLevel: DetailLevel.Full,
    };
  } catch (error) {
    if (signal?.aborted) {
      return null;
    }
    console.error(`Clojure mapper failed: ${error}`);
    return null;
  }
}
