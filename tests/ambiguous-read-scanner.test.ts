import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanSessionDirectory } from "../scripts/scan-ambiguous-read-calls.mjs";

const writeSession = (path: string, rows: unknown[]) => writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
const assistantRead = (timestamp: string, calls: Record<string, unknown>[], provider: string, model: string) => ({
  type: "message",
  timestamp,
  message: {
    role: "assistant",
    provider,
    model,
    content: calls.map((arguments_, index) => ({ type: "toolCall", id: `call-${index}`, name: "read", arguments: arguments_ })),
  },
});

describe("ambiguous read scanner", () => {
  it("recursively pins the baseline numerator, denominators, routes, periods, and self-corrections", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-session-scan-"));
    const nested = join(dir, "encoded-project");
    mkdirSync(nested);
    writeSession(join(dir, "before.jsonl"), [
      { type: "session", timestamp: "2026-05-01T00:00:00Z", id: "before" },
      assistantRead("2026-05-01T00:01:00Z", [
        { path: "src/a.ts", symbol: "alpha", limit: 20 },
        { path: "src/a.ts", symbol: "alpha" },
        { path: "src/plain.ts" },
      ], "openai-codex", "gpt-test"),
    ]);
    writeSession(join(nested, "after.jsonl"), [
      { type: "session", timestamp: "2026-06-01T00:00:00Z", id: "after" },
      assistantRead("2026-06-01T00:01:00Z", [
        { path: "src/b.ts", symbol: "beta", map: true },
        { path: "src/other.ts", map: true },
      ], "anthropic", "claude-test"),
    ]);

    expect(await scanSessionDirectory(dir, { compactSince: new Date("2026-05-16T00:00:00Z") })).toEqual({
      sessions: 2,
      totalReads: 5,
      modeUsingReads: 4,
      ambiguousReads: 2,
      affectedSessions: 2,
      selfCorrected: 1,
      routes: { "anthropic/claude-test": 1, "openai-codex/gpt-test": 1 },
      before: { modeUsingReads: 2, ambiguousReads: 1, rate: 0.5 },
      after: { modeUsingReads: 2, ambiguousReads: 1, rate: 0.5 },
    });
  });


  it("rejects invalid observation-window dates", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-session-scan-dates-"));
    await expect(scanSessionDirectory(dir, { through: new Date("not-a-date") })).rejects.toThrow(
      "Invalid through: expected an ISO date or timestamp.",
    );
    await expect(scanSessionDirectory(dir, { compactSince: new Date("not-a-date") })).rejects.toThrow(
      "Invalid compactSince: expected an ISO date or timestamp.",
    );
  });


  it("fails on corrupt session records instead of reporting partial statistics", async () => {
    const cases: Array<[string, string]> = [
      ["{not-json}\n", "Invalid JSON"],
      [JSON.stringify({ type: "message", timestamp: "2026-05-01T00:00:00Z" }) + "\n", "Missing session header"],
      [[
        { type: "session", timestamp: "2026-05-01T00:00:00Z", id: "bad-row-time" },
        assistantRead("not-a-time", [{ path: "src/a.ts" }], "openai-codex", "gpt-test"),
      ].map((row) => JSON.stringify(row)).join("\n") + "\n", "Invalid row timestamp"],
      [[
        { type: "session", timestamp: "2026-05-01T00:00:00Z", id: "bad-content" },
        {
          type: "message",
          timestamp: "2026-05-01T00:01:00Z",
          message: { role: "assistant", content: {} },
        },
      ].map((row) => JSON.stringify(row)).join("\n") + "\n", "Invalid assistant content"],
    ];
    for (const [content, message] of cases) {
      const dir = mkdtempSync(join(tmpdir(), "hashline-session-scan-corrupt-"));
      writeFileSync(join(dir, "session.jsonl"), content);
      await expect(scanSessionDirectory(dir)).rejects.toThrow(message);
    }
  });

  it("uses the session header for periods and the row timestamp for through", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-session-scan-cutoff-"));
    writeSession(join(dir, "session.jsonl"), [
      { type: "session", timestamp: "2026-05-01T00:00:00Z", id: "cutoff" },
      assistantRead("2026-06-01T00:00:00Z", [{ path: "src/a.ts", map: true }], "openai-codex", "gpt-test"),
      assistantRead("2026-06-02T00:00:00Z", [{ path: "src/b.ts", map: true }], "openai-codex", "gpt-test"),
      assistantRead("2026-06-03T00:00:00Z", [{ path: "src/c.ts", map: true }], "openai-codex", "gpt-test"),
    ]);
    const report = await scanSessionDirectory(dir, {
      compactSince: new Date("2026-05-16T00:00:00Z"),
      through: new Date("2026-06-02T00:00:00Z"),
    });
    expect(report.totalReads).toBe(2);
    expect(report.modeUsingReads).toBe(2);
    expect(report.before.modeUsingReads).toBe(2);
    expect(report.after.modeUsingReads).toBe(0);
  });

  it("strictly validates scanner CLI dates and options", () => {
    const dir = mkdtempSync(join(tmpdir(), "hashline-session-scan-cli-"));
    const script = join(process.cwd(), "scripts/scan-ambiguous-read-calls.mjs");
    for (const args of [
      ["--through", "2026-02-30"],
      ["--through", "05/16/2026"],
      ["--through", "2026-05-16", "--through", "2026-05-17"],
      ["--unknown", "2026-05-16"],
    ]) {
      const result = spawnSync(process.execPath, [script, dir, ...args], { encoding: "utf8" });
      expect(result.status, args.join(" ")).toBe(1);
      expect(result.stderr, args.join(" ")).toContain("Usage: scan-ambiguous-read-calls.mjs");
    }
  });
});
