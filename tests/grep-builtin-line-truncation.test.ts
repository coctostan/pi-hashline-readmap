import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGrepTool } from "@earendil-works/pi-coding-agent";
import { registerGrepTool } from "../src/grep.js";

function getText(result: any): string {
  return result.content?.find((c: any) => c.type === "text")?.text ?? "";
}

async function runBoth() {
  const dir = mkdtempSync(join(tmpdir(), "pi-grep-line-truncation-"));
  const filePath = join(dir, "big.txt");
  const line = "needle " + "x".repeat(20000);
  writeFileSync(filePath, line, "utf8");

  const builtin = createGrepTool(process.cwd());
  let wrapped: any = null;
  registerGrepTool({ registerTool(def: any) { wrapped = def; } } as any);

  const builtinResult = await builtin.execute(
    "builtin",
    {
      pattern: "needle",
      path: filePath,
      literal: true,
      limit: 100,
    },
    new AbortController().signal,
    () => {},
  );

  const wrappedResult = await wrapped.execute(
    "wrapped",
    {
      pattern: "needle",
      path: filePath,
      literal: true,
      limit: 100,
    },
    new AbortController().signal,
    () => {},
    { cwd: process.cwd() },
  );

  return {
    builtinText: getText(builtinResult),
    wrappedText: getText(wrappedResult),
    filePath,
  };
}

describe("grep builtin line truncation", () => {
  it("keeps builtin line truncation markers in wrapped match lines", async () => {
    const { builtinText, wrappedText, filePath } = await runBoth();
    const builtinFirstLine = builtinText.split("\n")[0] ?? "";
    const wrappedMatchLine = wrappedText.split("\n").find((line) => line.startsWith(`${filePath}:>>1:`)) ?? "";

    expect(builtinFirstLine.endsWith("... [truncated]")).toBe(true);
    expect(wrappedMatchLine.endsWith("... [truncated]")).toBe(true);
  });
});
