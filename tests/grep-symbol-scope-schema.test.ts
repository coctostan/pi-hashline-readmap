// tests/grep-symbol-scope-schema.test.ts
import { describe, it, expect } from "vitest";
import assert from "node:assert/strict";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { registerGrepTool } from "../src/grep.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getGrepTool() {
  let capturedTool: any = null;
  registerGrepTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("grep tool was not registered");
  return capturedTool;
}

async function callGrepTool(params: {
  pattern: string;
  path: string;
  literal?: boolean;
  context?: number;
  summary?: boolean;
  scope?: "symbol";
}) {
  const tool = await getGrepTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

describe("grep scope schema passthrough", () => {
  it("adds optional scope while preserving summary mode and default output", async () => {
    const tool = await getGrepTool();
    expect(tool.parameters.properties.scope).toBeDefined();
    expect(tool.parameters.properties.scope.enum).toEqual(["symbol"]);
    expect(tool.parameters.required ?? []).not.toContain("scope");

    const filePath = resolve(fixturesDir, "small.ts");

    const summaryBaseline = await callGrepTool({
      pattern: "export",
      path: filePath,
      literal: true,
      summary: true,
    });

    const summaryScoped = await callGrepTool({
      pattern: "export",
      path: filePath,
      literal: true,
      summary: true,
      scope: "symbol",
    });

    expect(getTextContent(summaryScoped)).toBe(getTextContent(summaryBaseline));
    expect(summaryScoped.details?.ptcValue).toEqual(summaryBaseline.details?.ptcValue);

    const normal = await callGrepTool({
      pattern: "createDemoDirectory",
      path: filePath,
      literal: true,
      context: 1,
    });

    expect(getTextContent(normal)).toContain("--- small.ts (1 matches) ---");
    expect(normal.details?.ptcValue?.records).toHaveLength(3);
    expect((normal.details?.ptcValue as any).scopes).toBeUndefined();
  });

  it("exposes optional scopeContext as a number-or-string union", async () => {
    const tool = await getGrepTool();
    expect(tool.parameters.properties.scopeContext).toBeDefined();
    expect(tool.parameters.properties.scopeContext.anyOf).toBeDefined();
    expect(tool.parameters.required ?? []).not.toContain("scopeContext");
  });
});

it("grep.scope uses a Google-compatible optional string enum", async () => {
  const tool = await getGrepTool();
  const schema = tool.parameters.properties.scope;
  assert.deepEqual(schema.enum, ["symbol"]);
  assert.deepEqual(JSON.parse(JSON.stringify(schema)), {
    type: "string",
    enum: ["symbol"],
    description: "symbol only; enables scopeContext",
  });
  assert.ok(!(tool.parameters.required ?? []).includes("scope"));
  assert.deepEqual(tool.parameters.required, ["pattern"]);
  const validate = (args: Record<string, unknown>) =>
    validateToolArguments(tool, { type: "toolCall", id: "enum", name: tool.name, arguments: args });
  const base = { pattern: "needle" };
  assert.doesNotThrow(() => validate(base));
  assert.doesNotThrow(() => validate({ ...base, scope: "symbol" }));
  for (const scope of ["other", "", 42, false]) {
    assert.throws(() => validate({ ...base, scope }));
  }
  assert.throws(() => validate({ scope: "symbol" }));
});
