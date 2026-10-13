import { describe, it, expect } from "vitest";
import piHashlineReadmapExtension from "../index.ts";
import { mkdtempSync, readFileSync } from "node:fs";
import { writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

function captureTools() {
  const tools: Record<string, any> = {};
  const pi = {
    registerTool(def: any) {
      tools[def.name] = def;
    },
    on() {},
    events: { emit() {}, on() {} },
  };
  piHashlineReadmapExtension(pi as any);
  return tools;
}

function getTextContent(result: any): string {
  return result.content?.find((item: any) => item.type === "text")?.text ?? "";
}

describe("repro 109 — anchor contract", () => {
  it("allows grep anchors to be edited without an intermediate read", async () => {
    const tools = captureTools();
    const dir = mkdtempSync(join(tmpdir(), "pi-repro-109-grep-"));
    const filePath = resolve(dir, "sample.ts");
    await writeFile(filePath, "const value = 1;\nconst other = 2;\n", "utf8");

    const grepResult = await tools.grep.execute(
      "grep-call",
      { pattern: "value", path: filePath, literal: true },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const grepText = getTextContent(grepResult);
    const anchor = grepText.match(/:(?:>>|  )(\d+:[0-9a-f]{3})\|/)?.[1];
    expect(anchor).toBeDefined();

    const editResult = await tools.edit.execute(
      "edit-call",
      { path: filePath, edits: [{ set_line: { anchor, new_text: "const value = 2;" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(editResult.isError).toBeFalsy();
    expect(readFileSync(filePath, "utf8")).toContain("const value = 2;");

    await rm(dir, { recursive: true, force: true });
  });

  it("allows ast_search anchors to be edited without an intermediate read", async () => {
    const tools = captureTools();
    const dir = mkdtempSync(join(tmpdir(), "pi-repro-109-sg-"));
    const filePath = resolve(dir, "sample.ts");
    await writeFile(filePath, "const value = 1;\nconst other = 2;\n", "utf8");

    const searchResult = await tools.ast_search.execute(
      "sg-call",
      { pattern: "const $NAME = $_", lang: "typescript", path: filePath },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const searchText = getTextContent(searchResult);
    const anchor = searchText.match(/>>(\d+:[0-9a-f]{3})\|/)?.[1];
    expect(anchor).toBeDefined();

    const editResult = await tools.edit.execute(
      "edit-call",
      { path: filePath, edits: [{ set_line: { anchor, new_text: "const value = 2;" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(editResult.isError).toBeFalsy();
    expect(readFileSync(filePath, "utf8")).toContain("const value = 2;");

    await rm(dir, { recursive: true, force: true });
  });

  it("allows write anchors to be edited without an intermediate read", async () => {
    const tools = captureTools();
    const dir = mkdtempSync(join(tmpdir(), "pi-repro-109-write-"));
    const filePath = resolve(dir, "written.ts");

    const writeResult = await tools.write.execute(
      "write-call",
      { path: filePath, content: "export const x = 1;\n" },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const writeText = getTextContent(writeResult);
    const anchor = writeText.match(/^(\d+:[0-9a-f]{3})\|/m)?.[1];
    expect(anchor).toBeDefined();

    const editResult = await tools.edit.execute(
      "edit-call",
      { path: filePath, edits: [{ set_line: { anchor, new_text: "export const x = 2;" } }] },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );

    expect(editResult.isError).toBeFalsy();
    expect(readFileSync(filePath, "utf8")).toContain("export const x = 2;");

    await rm(dir, { recursive: true, force: true });
  });

  it("points at read, not ptcValue, in the visible large-write summary", async () => {
    const tools = captureTools();
    const dir = mkdtempSync(join(tmpdir(), "pi-repro-109-trunc-"));
    const filePath = resolve(dir, "long.txt");
    const content = Array.from({ length: 2003 }, (_, index) => `line ${index + 1}`).join("\n");

    const writeResult = await tools.write.execute(
      "write-call",
      { path: filePath, content },
      new AbortController().signal,
      () => {},
      { cwd: process.cwd() },
    );
    const text = getTextContent(writeResult);

    expect(writeResult.isError).toBeFalsy();
    expect(writeResult.details?.ptcValue?.lines).toHaveLength(0);
    expect(writeResult.details?.ptcValue?.truncated).toBe(true);
    expect(writeResult.details?.ptcValue?.totalLines).toBe(2003);
    expect(text).toContain("use read with offset/limit");
    expect(text).not.toContain("ptcValue");

    await rm(dir, { recursive: true, force: true });
  });
});
