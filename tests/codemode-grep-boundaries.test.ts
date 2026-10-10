import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ result: {} as any }));
vi.mock("@earendil-works/pi-coding-agent", async original => {
  const actual = await original<any>();
  return { ...actual, createGrepTool: () => ({ execute: async () => native.result }) };
});
import { registerGrepTool } from "../src/grep.js";
import { withCodemodeIntegration } from "../src/codemode-integration.js";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const cwd of directories.splice(0)) rmSync(cwd, { recursive: true, force: true });
});
function harness() {
  const cwd = mkdtempSync(join(tmpdir(), "grep-boundaries-"));
  directories.push(cwd);
  writeFileSync(join(cwd, "a.txt"), "needle\nneedle\nneedle\n");
  writeFileSync(join(cwd, "a.bin"), Buffer.from([0, 1, 2]));
  let tool: any;
  registerGrepTool(withCodemodeIntegration({ registerTool(def: any) { tool = def; } } as any));
  return (path = "a.txt") => tool.execute("id", { pattern: "needle", path }, undefined, undefined, { cwd });
}
function response(text: string, details: any = {}) {
  native.result = { content: [{ type: "text", text }], details };
}

it("marks non-match-shaped unrecognized native text unknown", async () => {
  const call = harness();
  response("Unrecognized native search response");
  const result = await call();
  if (result.structuredContent?.completeness?.search !== "unknown") {
    throw new Error("Unrecognized native grep output was not classified unknown");
  }
  expect(result.structuredContent.completeness.omittedMatches).toBeNull();
  expect(result.structuredContent.text).toContain("Unrecognized native search response");
});

it("marks an empty native success unknown", async () => {
  const call = harness();
  native.result = { content: [], details: {} };
  expect((await call()).structuredContent.completeness).toMatchObject({ search: "unknown", omittedMatches: null });
});

it("marks an unvalidated match-shaped response unknown", async () => {
  const call = harness();
  response("alien.txt:1: needle");
  const result = await call();
  expect(result.structuredContent.completeness).toMatchObject({ search: "unknown", omittedMatches: null });
  expect(result.structuredContent.text).toContain("alien.txt:1: needle");
});

it("marks direct binary warnings unknown", async () => {
  const call = harness();
  response("No matches found");
  expect((await call("a.bin")).structuredContent.completeness).toMatchObject({ search: "unknown", omittedMatches: null });
});

it("recognizes an unbounded canonical zero-match response", async () => {
  const call = harness();
  response("No matches found");
  const result = await call();
  expect(result.structuredContent.totalMatches).toBe(0);
  expect(result.structuredContent.completeness).toMatchObject({ search: "complete", omittedMatches: 0 });
});

it("keeps native bounds authoritative even on a canonical zero-match response", async () => {
  const call = harness();
  response("No matches found", { truncation: { truncated: true } });
  expect((await call()).structuredContent.completeness).toMatchObject({ search: "unknown", nativeTruncated: true });
});

it("retains partial records but reports unrecognized substantive lines", async () => {
  const call = harness();
  response("a.txt:1: needle\nUnrecognized native search response");
  const result = await call();
  expect(result.structuredContent.totalMatches).toBe(1);
  expect(result.structuredContent.records).toHaveLength(1);
  expect(result.structuredContent.records[0].raw).toBe("needle");
  expect(result.structuredContent.completeness).toMatchObject({ search: "unknown", omittedMatches: null });
  expect(result.structuredContent.text).toContain("Unrecognized native search response");
});

it.each([
  ["a.txt:1: needle\n--\na.txt:3: needle\n", {}, "complete", false, false],
  ["a.txt:1: needle\n\n[3 matches limit reached. Use limit=6 for more, or refine pattern]",
    { matchLimitReached: 3 }, "unknown", false, false],
  ["a.txt:1: needle\n\n[Some lines truncated to 500 chars. Use read tool to see full lines]",
    { linesTruncated: true }, "complete", false, true],
  ["a.txt:1: needle\n\n[50.0KB limit reached. Some lines truncated to 500 chars. Use read tool to see full lines]",
    { truncation: { truncated: true }, linesTruncated: true }, "unknown", true, true],
] as const)("recognizes separators and native notices: %s", async (text, details, search, nativeTruncated, displayTruncated) => {
  const call = harness();
  response(text, details);
  expect((await call()).structuredContent.completeness).toMatchObject({
    search, omittedMatches: 0, nativeTruncated, displayTruncated,
  });
});

it("reports the native byte budget separately from display clipping", async () => {
  const call = harness();
  response("a.txt:1: needle", { truncation: { truncated: true } });
  expect((await call()).structuredContent.completeness).toEqual({
    search: "unknown", limitReached: false, nativeTruncated: true, omittedMatches: 0, displayTruncated: false,
  });
});

it("clips display without clipping script records", async () => {
  const call = harness();
  response("a.txt:1: needle\na.txt:2: needle\na.txt:3: needle");
  vi.stubEnv("PI_HASHLINE_GREP_MAX_LINES", "1");
  const result = await call();
  expect(result.structuredContent.completeness).toEqual({
    search: "complete", limitReached: false, nativeTruncated: false, omittedMatches: 0, displayTruncated: true,
  });
  expect(result.structuredContent.records).toHaveLength(3);
  expect(result.structuredContent.records.every((r: any) => r.raw === "needle")).toBe(true);
  expect(result.details.ptcValue.records.every((r: any) => !("raw" in r))).toBe(true);
});

it("does not normalize a native error into success", async () => {
  const call = harness();
  native.result = { isError: true, content: [{ type: "text", text: "native error" }], details: {} };
  const result = await call();
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toBeUndefined();
});
