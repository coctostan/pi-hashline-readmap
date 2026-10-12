import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRunPlan, formatResultsTable, summarizeResults } from "../scripts/startup-bench-lib.mjs";

describe("buildRunPlan", () => {
  const plan = buildRunPlan({ repo: "/repo", lazyDir: "/lazy", bundleDir: "/bundle", runs: 3 });
  const find = (variant: string, mode: string) => plan.find((e: any) => e.variant === variant && e.mode === mode)!;

  it("plans warm and cold runs for all four variants", () => {
    expect(plan.map((e: any) => `${e.variant}-${e.mode}`)).toEqual([
      "a-warm", "a-cold", "b-warm", "b-cold", "c-warm", "c-cold", "d-warm", "d-cold",
    ]);
    expect(plan.every((e: any) => e.repeat === 3)).toBe(true);
  });

  it("loads (b) from the source file, (c) from the lazy prototype, and (d) through the package manifest", () => {
    const base = ["--no-session", "--no-extensions"];
    expect(find("a", "warm").args).toEqual([...base, "--list-models"]);
    expect(find("b", "warm").args).toEqual([...base, "-e", join("/repo", "index.ts"), "--list-models"]);
    expect(find("c", "warm").args).toEqual([...base, "-e", join("/lazy", "index.ts"), "--list-models"]);
    expect(find("d", "warm").args).toEqual([...base, "-e", "/bundle", "--list-models"]);
  });

  it("disables the jiti transform cache for cold runs only and discards one warm-up run", () => {
    expect(find("b", "cold").env).toEqual({ JITI_FS_CACHE: "false" });
    expect(find("b", "warm").env).toEqual({});
    expect(find("b", "warm").discardFirst).toBe(true);
    expect(find("b", "cold").discardFirst).toBe(false);
  });

  it("omits variants whose directory was not supplied", () => {
    const small = buildRunPlan({ repo: "/repo", runs: 3 });
    expect(small.map((e: any) => e.variant)).toEqual(["a", "a", "b", "b"]);
  });

  it("requires at least 3 runs", () => {
    expect(() => buildRunPlan({ repo: "/repo", runs: 2 })).toThrow("runs must be an integer >= 3");
    expect(() => buildRunPlan({ repo: "/repo", runs: 3.5 })).toThrow("runs must be an integer >= 3");
  });
});

describe("summarizeResults / formatResultsTable", () => {
  const runs = {
    a: { warm: [0.2, 0.2, 0.2], cold: [0.2, 0.2, 0.2] },
    b: { warm: [0.9, 1.0, 0.95], cold: [1.6, 1.7, 1.6] },
  };

  it("computes medians and overhead versus the warm no-extension median", () => {
    const rows = summarizeResults(runs);
    expect(rows).toEqual([
      { variant: "a", mode: "warm", medianSeconds: 0.2, overheadSeconds: 0 },
      { variant: "a", mode: "cold", medianSeconds: 0.2, overheadSeconds: 0 },
      { variant: "b", mode: "warm", medianSeconds: 0.95, overheadSeconds: 0.95 - 0.2 },
      { variant: "b", mode: "cold", medianSeconds: 1.6, overheadSeconds: 1.6 - 0.2 },
    ]);
  });

  it("renders a markdown table", () => {
    expect(formatResultsTable(summarizeResults(runs))).toBe([
      "| Variant | Mode | Median (s) | Overhead vs (a) (s) |",
      "|---|---|---|---|",
      "| a | warm | 0.20 | 0.00 |",
      "| a | cold | 0.20 | 0.00 |",
      "| b | warm | 0.95 | 0.75 |",
      "| b | cold | 1.60 | 1.40 |",
    ].join("\n"));
  });
});
