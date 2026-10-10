import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { registerReadTool } from "../src/read.js";
import { withCodemodeIntegration } from "../src/codemode-integration.js";

const directories: string[] = [];
afterEach(() => {
  for (const cwd of directories.splice(0)) rmSync(cwd, { recursive: true, force: true });
});
function harness() {
  const cwd = mkdtempSync(join(tmpdir(), "strict-symbol-"));
  directories.push(cwd);
  let tool: any;
  let served = 0;
  registerReadTool(withCodemodeIntegration({ registerTool(t: any) { tool = t; } } as any),
    { onSuccessfulRead() { served++; } });
  writeFileSync(join(cwd, "a.ts"), [
    "class First {", "  run() { return 1; }", "}",
    "class Second {", "  run() { return 2; }", "}",
    "export function alphaExact() { return 3; }", "",
  ].join("\n"));
  writeFileSync(join(cwd, "plain.txt"), "plain text\n");
  const call = (args: any) => tool.execute("id", args, undefined, undefined, { cwd });
  return { call, served: () => served };
}

it.each([
  ["a.ts", "ZZZ262", "symbol-not-found"],
  ["a.ts", "run", "symbol-ambiguous"],
  ["a.ts", "alphaE", "symbol-fuzzy"],
  ["plain.txt", "alpha", "symbol-unmappable"],
  ["image.png", "alpha", "symbol-unmappable"],
])("strictSymbol refuses %s / %s as %s", async (path, symbol, code) => {
  const { call, served } = harness();
  const result = await call({ path, symbol, strictSymbol: true, errorMode: "value" });
  if (!result.isError) throw new Error("strictSymbol silently fell back");
  expect(result.structuredContent).toMatchObject({ ok: false, error: { code } });
  expect(result.structuredContent.lines).toBeUndefined();
  expect(served()).toBe(0);
});

it.each([undefined, " "])("strictSymbol requires a nonempty symbol (%j)", async symbol => {
  const { call, served } = harness();
  const result = await call({ path: "a.ts", symbol, strictSymbol: true, errorMode: "value" });
  expect(result.structuredContent.error.code).toBe("invalid-params-combo");
  expect(served()).toBe(0);
});

it.each(["alphaExact", "First.run", "run@2", "ALPHAEXACT"])(
  "strictSymbol accepts the exact selector %s", async symbol => {
    const { call, served } = harness();
    const result = await call({ path: "a.ts", symbol, strictSymbol: true });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent.lines.length).toBeGreaterThan(0);
    expect(result.structuredContent.symbol).not.toBeNull();
    expect(served()).toBe(1);
  },
);

it("retains interactive missing-symbol fallback", async () => {
  const { call } = harness();
  const result = await call({ path: "a.ts", symbol: "ZZZ262" });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent.warnings.some((w: any) => w.code === "symbol-warning")).toBe(true);
  expect(result.structuredContent.lines).toHaveLength(7);
});

it("retains interactive ambiguity choices", async () => {
  const { call } = harness();
  const result = await call({ path: "a.ts", symbol: "run" });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent.ambiguity.totalCandidates).toBe(2);
});

it("retains interactive fuzzy selection", async () => {
  const { call } = harness();
  const result = await call({ path: "a.ts", symbol: "alphaE" });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent.warnings.some((w: any) => w.code === "fuzzy-symbol-match")).toBe(true);
});

it("retains interactive unmappable-file fallback", async () => {
  const { call } = harness();
  const result = await call({ path: "plain.txt", symbol: "alpha" });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent.lines[0].raw).toBe("plain text");
});
