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

// Since Pi 1.5.1 the host flags its match limit only when more than `limit` matches exist; Pi 1.5.0 also flagged exactly `limit`.
describe("grep positive match-limit notice", () => {
  it.each([
    [2, 1, "unknown"],
    [1, 1, "complete"],
  ] as const)("count=%i limit=%i: one canonical notice only past the limit, search %s", async (count, limit, search) => {
    const dir = mkdtempSync(join(tmpdir(), "pi-grep-limit-notice-"));
    try {
      const filePath = join(dir, "sample.txt");
      writeFileSync(filePath, "needle\n".repeat(count), "utf8");
      const result = await captureGrepTool().execute(
        "grep-limit-notice", { pattern: "needle", path: filePath, literal: true, limit },
        new AbortController().signal, () => {}, { cwd: process.cwd() },
      );
      const text = result.content.find((item: any) => item.type === "text")?.text ?? "";
      const bracketedNotices = text.split("\n").filter((line: string) => line.startsWith("[") && line.endsWith("]")).slice(1);
      expect(bracketedNotices).toEqual(count > limit
        ? ["[Search stopped at 1 matches; completeness unknown — refine pattern or increase limit]"]
        : []);
      expect(result.details.matchLimitReached).toBe(count > limit ? limit : undefined);
      expect(result.details.ptcValue.totalMatches).toBe(limit);
      expect(result.details.ptcValue.completeness.search).toBe(search);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
