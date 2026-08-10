import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { Language, Parser } from "web-tree-sitter";
import { reportParserError } from "./parser-errors.js";

export type WasmLanguageId = "rust" | "cpp" | "c-header" | "java" | "c" | "swift";
export type WasmParser = Parser;

const require_ = createRequire(import.meta.url);
const wasmNames: Record<WasmLanguageId, string> = {
  rust: "rust",
  cpp: "cpp",
  "c-header": "cpp",
  java: "java",
  c: "c",
  swift: "swift",
};
let initPromise: Promise<void> | null = null;
const languages = new Map<WasmLanguageId, Language>();
const languageLoads = new Map<WasmLanguageId, Promise<Language | null>>();

function isBun(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

function wasmPath(langId: WasmLanguageId): string {
  const pkg = require_.resolve("@repomix/tree-sitter-wasms/package.json");
  return join(dirname(pkg), "out", `tree-sitter-${wasmNames[langId]}.wasm`);
}

async function init(): Promise<void> {
  initPromise ??= Parser.init().catch((err: unknown) => {
    initPromise = null;
    reportParserError("wasm:init", err, { context: "web-tree-sitter initialization failed" });
    throw err;
  });
  return initPromise;
}

async function language(langId: WasmLanguageId): Promise<Language | null> {
  const loaded = languages.get(langId);
  if (loaded) return loaded;

  const inFlight = languageLoads.get(langId);
  if (inFlight) return inFlight;

  const loadPromise = (async () => {
    try {
      await init();
      const lang = await Language.load(wasmPath(langId));
      languages.set(langId, lang);
      return lang;
    } catch (err) {
      reportParserError(`wasm:load:${langId}`, err, {
        context: `tree-sitter WASM grammar load failed for ${langId}`,
      });
      return null;
    } finally {
      languageLoads.delete(langId);
    }
  })();

  languageLoads.set(langId, loadPromise);
  return loadPromise;
}

export async function getWasmParser(langId: WasmLanguageId): Promise<WasmParser | null> {
  if (isBun()) return null;
  const lang = await language(langId);
  if (!lang) return null;
  let parser: Parser | null = null;
  try {
    parser = new Parser();
    parser.setLanguage(lang);
    return parser;
  } catch (err) {
    try {
      parser?.delete();
    } catch (deleteErr) {
      reportParserError(
        `wasm:delete:parser-loader:${langId}:${deleteErr instanceof Error ? deleteErr.message : String(deleteErr)}`,
        deleteErr,
        { context: `tree-sitter WASM parser cleanup failed for ${langId}` },
      );
    }
    reportParserError(`wasm:parser:${langId}`, err, {
      context: `tree-sitter WASM parser creation failed for ${langId}`,
    });
    return null;
}
}

export function __resetWasmParserLoaderForTests(): void {
  initPromise = null;
  languages.clear();
  languageLoads.clear();
}
