import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (path: any, ...args: any[]) => {
      const value = String(path);
      if (value.endsWith("permission.txt")) {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      }
      if (value.endsWith("generic.txt")) {
        throw Object.assign(new Error("I/O failure"), { code: "EIO" });
      }
      return (actual.readFile as any)(path, ...args);
    }),
  };
});

async function tool(): Promise<any> {
  const { registerReadTool } = await import("../src/read.js");
  let captured: any;
  registerReadTool({ registerTool(def: any) { captured = def; } } as any);
  return captured;
}

function textOf(result: any): string {
  return result.content.find((item: any) => item.type === "text")?.text ?? "";
}

describe("read adjusted execution failures", () => {
  it("decorates every execution-error family reached after recovery", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "read-adjusted-errors-"));
    try {
      const subdirectory = resolve(directory, "subdirectory");
      const readable = resolve(directory, "readable.txt");
      mkdirSync(subdirectory);
      writeFileSync(readable, "one\ntwo\n", "utf8");

      const cases = [
        { params: { path: subdirectory, offset: "" }, adjustment: "ignored empty offset", code: "path-is-directory" },
        { params: { path: resolve(directory, "permission.txt"), limit: "" }, adjustment: "ignored empty limit", code: "permission-denied" },
        { params: { path: resolve(directory, "missing.txt"), offset: "" }, adjustment: "ignored empty offset", code: "file-not-found" },
        { params: { path: resolve(directory, "generic.txt"), limit: "" }, adjustment: "ignored empty limit", code: "fs-error" },
        { params: { path: readable, offset: 999, limit: "" }, adjustment: "ignored empty limit", code: "offset-past-end" },
      ] as const;

      const readTool = await tool();
      for (const { params, adjustment, code } of cases) {
        const result = await readTool.execute(
          "read-adjusted-execution-error",
          params,
          new AbortController().signal,
          () => {},
          { cwd: process.cwd() },
        );

        expect(result.isError).toBe(true);
        expect(result.details.ptcValue.error.code).toBe(code);
        expect(textOf(result)).toContain(`[Read params adjusted: ${adjustment}]`);
        expect(textOf(result)).toContain(result.details.ptcValue.error.message);
        expect(result.details.ptcValue.warnings).toEqual(
          expect.arrayContaining([expect.objectContaining({ code: "params-adjusted" })]),
        );
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
