import { describe, expect, it } from "vitest";
import { formatAmbiguous } from "../src/readmap/symbol-error-format.js";
import type { SymbolMatch } from "../src/readmap/symbol-lookup.js";

const candidates = (count: number): SymbolMatch[] => Array.from(
  { length: count },
  (_, i) => ({
    name: "process",
    kind: "method" as any,
    startLine: i * 2 + 1,
    endLine: i * 2 + 2,
  }),
);

describe("formatAmbiguous budget", () => {
  it("shows five rows and reports only real omissions", () => {
    const atBudget = formatAmbiguous("process", candidates(5));
    expect((atBudget.match(/^- process/gm) ?? [])).toHaveLength(5);
    expect(atBudget).not.toContain("additional candidates omitted");

    const overBudget = formatAmbiguous("process", candidates(8));
    expect((overBudget.match(/^- process/gm) ?? [])).toHaveLength(5);
    expect(overBudget).toContain("3 additional candidates omitted.");
  });

  it("renders qualified recovery selectors for shown and omitted candidates", () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      name: "process",
      parentName: `Worker${i + 1}`,
      kind: "method" as any,
      startLine: i * 2 + 1,
      endLine: i * 2 + 2,
    }));
    const output = formatAmbiguous("process", items);
    expect(output).toContain("- Worker1.process (method) — lines 1-2");
    expect(output).toContain("Worker6.process or process@11");
    expect(output).toContain("Worker7.process or process@13");
    expect(output).toContain("Worker8.process or process@15");
  });
});
