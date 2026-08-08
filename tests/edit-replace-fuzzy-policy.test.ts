import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { ensureHashInit } from "../src/hashline.js";
import { registerEditTool } from "../src/edit.js";

async function callEditTool(params: Record<string, unknown>) {
  let capturedTool: any = null;
  registerEditTool({ registerTool(def: any) { capturedTool = def; } } as any);
  if (!capturedTool) throw new Error("edit tool was not registered");
  return capturedTool.execute("test-call", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

function makeFixture(content: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-fuzzy-policy-"));
  const filePath = resolve(dir, "sample.txt");
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

function getTextContent(result: any): string {
  return result.content.find((c: any) => c.type === "text")?.text ?? "";
}

describe("edit replace fuzzy policy", () => {
  beforeAll(async () => {
    await ensureHashInit();
  });

  it("rejects stale fuzzy-only replace by default and leaves the file unchanged", async () => {
    const current = "alpha   \n beta\n gamma\n";
    const filePath = makeFixture(current);

    const result = await callEditTool({
      path: filePath,
      edits: [{ replace: { old_text: "alpha\n beta\n gamma\n", new_text: "alpha\n" } }],
    });

    expect(result.isError).toBe(true);
    expect(result.details?.ptcValue?.error?.code).toBe("text-not-found");
    expect(getTextContent(result)).toContain("Could not find exact text to replace");
    expect(result.details?.ptcValue?.error?.hint).toContain("Re-read the file");
    expect(result.details?.ptcValue?.error?.hint).toContain("set_line/replace_lines/insert_after");
    expect(readFileSync(filePath, "utf-8")).toBe(current);
  });


  it("allows explicit fuzzy non-all replace and emits a fuzzy warning", async () => {
    const filePath = makeFixture("alpha   \n beta\n gamma\n");

    const result = await callEditTool({
      path: filePath,
      edits: [{ replace: { old_text: "alpha\n beta\n gamma\n", new_text: "alpha\n", fuzzy: true } }],
    });

    expect(result.isError).not.toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("alpha\n");
    const text = getTextContent(result);
    expect(text).toContain("Warnings:");
    expect(text).toContain("replace used fuzzy matching because exact old_text was not found");
    expect(text).toContain("prefer set_line/replace_lines/insert_after");
    expect(result.details?.ptcValue?.warnings).toContain(
      "replace used fuzzy matching because exact old_text was not found; re-read the file and prefer set_line/replace_lines/insert_after for hash-verified edits.",
    );
  });


  it("allows explicit fuzzy all:true replace and emits a fuzzy warning", async () => {
    const filePath = makeFixture("alpha   \n beta\n gamma\n\nalpha   \n beta\n gamma\n");

    const result = await callEditTool({
      path: filePath,
      edits: [{ replace: { old_text: "alpha\n beta\n gamma\n", new_text: "alpha\n", all: true, fuzzy: true } }],
    });

    expect(result.isError).not.toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("alpha\nalpha\n");
    const text = getTextContent(result);
    expect(text).toContain("Warnings:");
    expect(text).toContain("replace used fuzzy matching because exact old_text was not found");
    expect(result.details?.ptcValue?.warnings).toContain(
      "replace used fuzzy matching because exact old_text was not found; re-read the file and prefer set_line/replace_lines/insert_after for hash-verified edits.",
    );
  });
});
