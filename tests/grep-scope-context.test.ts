import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { registerGrepTool } from "../src/grep.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "fixtures");

async function getGrepTool() {
  let capturedTool: any = null;
  registerGrepTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("grep tool was not registered");
  return capturedTool;
}

async function callGrepTool(params: Record<string, unknown>) {
  const tool = await getGrepTool();
  return tool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function getTextContent(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

export function writeFixture(name: string, content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-grep-scope-context-"));
  const filePath = resolve(dir, name);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("grep scopeContext parameter", () => {
  beforeAll(async () => {
  });

  it("rejects non-numeric scopeContext string with a coercion error", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callGrepTool({
      pattern: "createDemoDirectory",
      path: filePath,
      literal: true,
      scope: "symbol",
      scopeContext: "not-a-number",
    });
    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toMatch(/scopeContext/);
    expect(text).toMatch(/base-10 integer/);
  });

  it("rejects negative scopeContext with a non-negative-integer error", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callGrepTool({
      pattern: "createDemoDirectory",
      path: filePath,
      literal: true,
      scope: "symbol",
      scopeContext: -1,
    });
    expect(result.isError).toBe(true);
    expect(getTextContent(result)).toBe("Invalid scopeContext: expected a non-negative integer, received -1.");
  });

  it("rejects scopeContext when scope is not 'symbol' and points to 'context'", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const result = await callGrepTool({
      pattern: "createDemoDirectory",
      path: filePath,
      literal: true,
      scopeContext: 3,
      // no scope: "symbol"
    });
    expect(result.isError).toBe(true);
    const text = getTextContent(result);
    expect(text).toContain("scopeContext");
    expect(text).toContain('scope: "symbol"');
    expect(text).toContain("context");
  });

  it("renders symbol header with '±0 lines' suffix and only match lines when scopeContext is 0", async () => {
    const filePath = writeFixture("win0.ts", [
      "export function alpha() {",
      "  const a = 1;",
      "  console.log(target);",
      "  const c = 3;",
      "  return target;",
      "}",
    ].join("\n"));

    const result = await callGrepTool({
      pattern: "target",
      path: filePath,
      literal: true,
      scope: "symbol",
      scopeContext: 0,
    });
    const text = getTextContent(result);
    const displayPath = basename(filePath);

    expect(text).toContain(`--- ${displayPath} :: function alpha (1-6, 2 matches, scoped to ±0 lines) ---`);
    expect(text).toMatch(/:>>3:[0-9a-f]+\|/);
    expect(text).toMatch(/:>>5:[0-9a-f]+\|/);
    expect(text).not.toMatch(/:  1:/);
    expect(text).not.toMatch(/:  2:/);
    expect(text).not.toMatch(/:  4:/);
    expect(text).not.toMatch(/:  6:/);
  });

  it("emits no extra warning line when the window clips at symbol boundary", async () => {
    const filePath = writeFixture("clip.ts", [
      "export function alpha() {",
      "  const target = 1;",
      "  const a = 2;",
      "  const b = 3;",
      "  const c = 4;",
      "  const d = 5;",
      "  return 0;",
      "}",
    ].join("\n"));

    const result = await callGrepTool({
      pattern: "target",
      path: filePath,
      literal: true,
      scope: "symbol",
      scopeContext: 5,
    });
    const text = getTextContent(result);

    expect(text).not.toMatch(/clipped/i);
    expect(text).not.toMatch(/\[Warning:.*boundary/);
  });

  it("renders ±N context lines around match with the header suffix (end-to-end)", async () => {
    const filePath = writeFixture("winN.ts", [
      "export function alpha() {",
      "  const a = 1;",
      "  const b = 2;",
      "  const c = 3;",
      "  const target = 4;",
      "  const e = 5;",
      "  const f = 6;",
      "  const g = 7;",
      "  return 0;",
      "}",
    ].join("\n"));

    const result = await callGrepTool({
      pattern: "target",
      path: filePath,
      literal: true,
      scope: "symbol",
      scopeContext: 2,
    });
    const text = getTextContent(result);
    const displayPath = basename(filePath);

    expect(text).toContain(`--- ${displayPath} :: function alpha (1-10, 1 matches, scoped to ±2 lines) ---`);
    expect(text).toMatch(/:  3:[0-9a-f]+\|/);
    expect(text).toMatch(/:  4:[0-9a-f]+\|/);
    expect(text).toMatch(/:>>5:[0-9a-f]+\|/);
    expect(text).toMatch(/:  6:[0-9a-f]+\|/);
    expect(text).toMatch(/:  7:[0-9a-f]+\|/);
    expect(text).not.toMatch(/:  1:/);
    expect(text).not.toMatch(/:  2:/);
    expect(text).not.toMatch(/:  8:/);
    expect(text).not.toMatch(/:  9:/);
    expect(text).not.toMatch(/:  10:/);
  });

  it("falls back unchanged when a file is unmappable; scopeContext has no effect", async () => {
    const filePath = resolve(fixturesDir, "plain.txt");
    const withCtx = await callGrepTool({
      pattern: "plain text",
      path: filePath,
      literal: true,
      scope: "symbol",
      scopeContext: 3,
    });
    const withoutCtx = await callGrepTool({
      pattern: "plain text",
      path: filePath,
      literal: true,
      scope: "symbol",
    });
    const textWithCtx = getTextContent(withCtx);
    const textWithoutCtx = getTextContent(withoutCtx);

    expect(textWithCtx).toContain(`[Warning: symbol scoping unavailable for ${filePath}`);
    expect(textWithCtx).toBe(textWithoutCtx);
    expect(textWithCtx).not.toContain("scoped to");
  });

  it("falls back unchanged for matches with no enclosing symbol; scopeContext has no effect", async () => {
    const filePath = writeFixture("no-symbol.ts", [
      "// lonely marker",
      "export function alpha() {",
      "  return 1;",
      "}",
    ].join("\n"));

    const withCtx = await callGrepTool({
      pattern: "lonely",
      path: filePath,
      literal: true,
      context: 1,
      scope: "symbol",
      scopeContext: 3,
    });
    const withoutCtx = await callGrepTool({
      pattern: "lonely",
      path: filePath,
      literal: true,
      context: 1,
      scope: "symbol",
    });
    const textWithCtx = getTextContent(withCtx);
    const textWithoutCtx = getTextContent(withoutCtx);

    expect(textWithCtx).toContain(`[Warning: no enclosing symbol for ${filePath}:1`);
    expect(textWithCtx).toBe(textWithoutCtx);
    expect(textWithCtx).not.toContain("scoped to");
  });

  it("summary: true silently ignores scopeContext", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const summary = await callGrepTool({
      pattern: "export",
      path: filePath,
      literal: true,
      summary: true,
      scope: "symbol",
      scopeContext: 3,
    });
    const baseline = await callGrepTool({
      pattern: "export",
      path: filePath,
      literal: true,
      summary: true,
    });

    expect(summary.isError).toBeUndefined();
    expect(getTextContent(summary)).toBe(getTextContent(baseline));
    expect((summary.details?.ptcValue as any).scopes).toBeUndefined();
    expect(getTextContent(summary)).not.toContain("scoped to");
  });

  it("omitting scopeContext returns byte-identical full-body output (back-compat)", async () => {
    const filePath = resolve(fixturesDir, "small.ts");
    const full = await callGrepTool({
      pattern: "createDemoDirectory",
      path: filePath,
      literal: true,
      scope: "symbol",
    });
    const fullText = getTextContent(full);

    expect(fullText).not.toContain("scoped to");
    expect((full.details?.ptcValue as any).scopes.groups[0].symbol).toBeDefined();
    expect((full.details?.ptcValue as any).scopes.groups[0].contextLines).toBeUndefined();
  });
});
