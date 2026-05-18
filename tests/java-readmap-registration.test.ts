import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clearMapCache } from "../src/map-cache.js";
import { registerGrepTool } from "../src/grep.js";
import { registerReadTool } from "../src/read.js";
import { generateMap, generateMapWithIdentity } from "../src/readmap/mapper.js";
import { SymbolKind } from "../src/readmap/enums.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(__dirname, "fixtures/KafkaConsumerConfiguration.java");
const qualifiedFixture = resolve(__dirname, "fixtures/QualifiedOuter.java");

async function readTool(params: { path: string; symbol?: string; map?: boolean; bundle?: "local" }) {
  let capturedTool: any = null;
  registerReadTool({ registerTool(def: any) { capturedTool = def; } } as any);
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

async function grepTool(params: { pattern: string; path: string; literal?: boolean; scope?: "symbol" }) {
  let capturedTool: any = null;
  registerGrepTool({ registerTool(def: any) { capturedTool = def; } } as any);
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function text(result: any): string {
  return result.content?.find((entry: any) => entry.type === "text")?.text ?? "";
}

describe("Java readmap registration and workflow integration", () => {
  beforeAll(async () => {
  });

  beforeEach(() => {
    clearMapCache();
  });

  it("uses the registered Java mapper for generated maps", async () => {
    const identity = await generateMapWithIdentity(fixture);
    expect(identity.mapperName).toBe("java");
    expect(identity.mapperVersion).toBeGreaterThanOrEqual(1);

    const map = await generateMap(fixture);
    expect(map?.language).toBe("Java");
    expect(map?.imports).toEqual([
      "package com.example.kafka;",
      "import java.util.Map;",
      "import org.springframework.context.annotation.Bean;",
    ]);
    expect(map?.symbols[0]).toEqual(expect.objectContaining({
      name: "KafkaConsumerConfiguration",
      kind: SymbolKind.Class,
      startLine: 6,
      endLine: 21,
    }));
  });

  it("uses registered Java maps for read map rendering and symbol reads", async () => {
    const mapRead = await readTool({ path: fixture, map: true });
    expect(text(mapRead)).toContain("File Map: KafkaConsumerConfiguration.java");
    expect(text(mapRead)).toContain("Java");
    expect(text(mapRead)).toContain("KafkaConsumerConfiguration");

    const classRead = await readTool({ path: fixture, symbol: "KafkaConsumerConfiguration" });
    expect(text(classRead)).toMatch(/^\[Symbol: KafkaConsumerConfiguration \(class\), lines 6-21 of 2\d\]/);
    expect(text(classRead)).toContain("public class KafkaConsumerConfiguration");

    const methodRead = await readTool({ path: fixture, symbol: "KafkaConsumerConfiguration.consumerFactory" });
    expect(text(methodRead)).toMatch(/^\[Symbol: consumerFactory \(method\) in KafkaConsumerConfiguration, lines 13-16 of 2\d\]/);
    expect(text(methodRead)).toContain("return Map.of");
  });

  it("reads package-qualified Java inner type symbols", async () => {
    const innerRead = await readTool({ path: qualifiedFixture, symbol: "com.example.qualified.QualifiedOuter.InnerType" });
    const output = text(innerRead);

    expect(output).toMatch(/^\[Symbol: InnerType \(class\) in QualifiedOuter, lines 4-8 of 10\]/);
    expect(output).toContain("public static class InnerType");
  });

  it("reads package-qualified Java top-level types", async () => {
    const outerRead = await readTool({ path: qualifiedFixture, symbol: "com.example.qualified.QualifiedOuter" });
    const output = text(outerRead);

    expect(output).toMatch(/^\[Symbol: QualifiedOuter \(class\), lines 3-9 of 10\]/);
    expect(output).toContain("public class QualifiedOuter");
    expect(output).toContain("public static class InnerType");
  });

  it("uses registered Java maps for local bundles and symbol-scoped grep", async () => {
    const bundleRead = await readTool({ path: fixture, symbol: "KafkaConsumerConfiguration.consumerFactory", bundle: "local" });
    expect(text(bundleRead)).toContain("## Requested symbol");
    expect(text(bundleRead)).toContain("## Local support");
    expect(text(bundleRead)).toContain("private String helperName()");

    const grep = await grepTool({ pattern: "bootstrap.servers", path: fixture, literal: true, scope: "symbol" });
    expect(text(grep)).toContain(`--- ${basename(fixture)} :: method consumerFactory in KafkaConsumerConfiguration (13-16, 1 matches) ---`);
    const consumerScope = grep.details?.ptcValue.scopes.groups.find(
      (group: any) => group.symbol.name === "consumerFactory",
    );
    expect(consumerScope?.symbol).toEqual(
      expect.objectContaining({ name: "consumerFactory", kind: "method", startLine: 13, endLine: 16 }),
    );
  });
});
