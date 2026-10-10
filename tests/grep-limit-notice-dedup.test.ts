import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerGrepTool } from "../src/grep.js";

function captureGrepTool(): any {
	let tool: any;
	registerGrepTool({ registerTool(def: any) { tool = def; } } as any);
	return tool;
}

describe("grep positive match-limit notice", () => {
  it("renders one canonical notice while preserving builtin limit metadata", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pi-grep-limit-notice-"));
    try {
      const filePath = join(dir, "sample.txt");
      for (const count of [1, 2]) {
        writeFileSync(filePath, "needle\n".repeat(count), "utf8");
        const result = await captureGrepTool().execute(
          "grep-limit-notice", { pattern: "needle", path: filePath, literal: true, limit: 1 },
          new AbortController().signal, () => {}, { cwd: process.cwd() },
        );
        const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
        if (!text.includes("completeness unknown")) throw new Error("Grep limit notice overstates completeness");
        const bracketedNotices = text.split("\n").filter((line: string) => line.startsWith("[") && line.endsWith("]")).slice(1);
        expect(bracketedNotices).toEqual([
          "[Search stopped at 1 matches; completeness unknown — refine pattern or increase limit]",
        ]);
        expect(result.details.matchLimitReached).toBe(1);
        expect(result.details.ptcValue.totalMatches).toBe(1);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
