import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  __resetWasmParserLoaderForTests,
  getWasmParser,
  type WasmLanguageId,
} from "../src/readmap/parser-loader.js";
import { generateMapWithIdentity } from "../src/readmap/mapper.js";
import { findSymbol } from "../src/readmap/symbol-lookup.js";
import { validateSyntaxRegression } from "../src/edit-syntax-validate.js";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const require_ = createRequire(import.meta.url);
const fixturesDir = resolve("tests", "fixtures");
const webAssembly = (globalThis as unknown as {
  WebAssembly: {
    compile(bytes: Uint8Array): Promise<unknown>;
    Module: { customSections(module: unknown, sectionName: string): ArrayBuffer[] };
  };
}).WebAssembly;

const nativePackages = [
  "tree-sitter",
  "tree-sitter-c",
  "tree-sitter-cpp",
  "tree-sitter-rust",
  "tree-sitter-java",
  "tree-sitter-clojure",
];

describe("tree-sitter WASM package manifest", () => {
  it("does not depend on native tree-sitter packages", () => {
    for (const name of nativePackages) {
      expect(packageJson.dependencies?.[name]).toBeUndefined();
      expect(packageLock.packages?.[`node_modules/${name}`]).toBeUndefined();
    }
  });

  it("does not bundle native tree-sitter package directories", () => {
    const bundled = packageJson.bundledDependencies ?? [];
    const files = packageJson.files ?? [];
    for (const name of nativePackages) {
      expect(bundled).not.toContain(name);
      expect(files).not.toContain(`node_modules/${name}`);
    }
  });

  it("uses Repomix grammars with web-tree-sitter 0.26 across parser consumers", async () => {
    expect(packageJson.dependencies?.["tree-sitter-wasms"]).toBeUndefined();
    expect(packageJson.dependencies?.["@repomix/tree-sitter-wasms"]).toBe("0.1.17");
    expect(packageJson.dependencies?.["web-tree-sitter"]).toBe("0.26.11");
    expect(packageLock.packages?.["node_modules/tree-sitter-wasms"]).toBeUndefined();
    expect(packageLock.packages?.["node_modules/@repomix/tree-sitter-wasms"]?.version).toBe("0.1.17");
    expect(packageLock.packages?.["node_modules/web-tree-sitter"]?.version).toBe("0.26.11");

    const grammarRoot = dirname(require_.resolve("@repomix/tree-sitter-wasms/package.json"));
    for (const language of ["rust", "cpp", "java"] as const) {
      const bytes = readFileSync(join(grammarRoot, "out", `tree-sitter-${language}.wasm`));
      const module = await webAssembly.compile(bytes);
      expect(webAssembly.Module.customSections(module, "dylink.0"), `${language} dylink.0`).toHaveLength(1);
      expect(webAssembly.Module.customSections(module, "dylink"), `${language} legacy dylink`).toHaveLength(0);
    }

    const parserSamples: Array<[WasmLanguageId, string]> = [
      ["rust", "pub struct RustThing;\n"],
      ["cpp", "class CppThing {};\n"],
      ["c-header", "class HeaderThing {};\n"],
      ["java", "class JavaThing {}\n"],
    ];
    __resetWasmParserLoaderForTests();
    for (const [langId, source] of parserSamples) {
      const parser = await getWasmParser(langId);
      expect(parser, `${langId} parser`).not.toBeNull();
      const tree = parser!.parse(source);
      expect(tree, `${langId} tree`).not.toBeNull();
      expect(tree!.rootNode.hasError, `${langId} parse errors`).toBe(false);
      tree!.delete();
      parser!.delete();
    }

    const mapCases = [
      ["wasm-rust-simple.rs", "rust", "Point"],
      ["wasm-cpp-simple.cpp", "cpp", "Point"],
      ["wasm-java-simple.java", "java", "Greeter"],
    ] as const;
    for (const [fixture, mapperName, symbolName] of mapCases) {
      const identity = await generateMapWithIdentity(join(fixturesDir, fixture));
      expect(identity.mapperName).toBe(mapperName);
      expect(identity.map).not.toBeNull();
      expect(findSymbol(identity.map!, symbolName).type).toBe("found");
    }

    const tempDir = mkdtempSync(join(tmpdir(), "repomix-header-"));
    try {
      const header = join(tempDir, "sample.h");
      writeFileSync(header, "class HeaderThing {};\n", "utf8");
      const identity = await generateMapWithIdentity(header);
      expect(identity.mapperName).toBe("c-header");
      expect(identity.map).not.toBeNull();
      expect(findSymbol(identity.map!, "HeaderThing").type).toBe("found");

      const invalidCases = [
        { filePath: join(tempDir, "bad.rs"), before: "struct Good {}\n", after: "struct Broken {\n" },
        { filePath: join(tempDir, "bad.cpp"), before: "int good() { return 1; }\n", after: "int broken() {\n" },
        { filePath: join(tempDir, "bad.h"), before: "int good();\n", after: "int broken() {\n" },
        { filePath: join(tempDir, "Bad.java"), before: "class Good {}\n", after: "class Broken {\n" },
      ];
      for (const input of invalidCases) {
        const result = await validateSyntaxRegression(input);
        expect(result, `${input.filePath} syntax regression`).not.toBeNull();
        expect(result!.newMissingCount).toBeGreaterThan(0);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      __resetWasmParserLoaderForTests();
    }
  });

  it("requires the current Pi Node baseline", () => {
    expect(packageJson.engines?.node).toBe(">=22.19.0");
  });
});
