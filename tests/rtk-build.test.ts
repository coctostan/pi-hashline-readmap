import { describe, expect, it } from "vitest";
import { filterBuildOutput } from "../src/rtk/build.ts";
import type { Drop } from "../src/rtk/drops.ts";

const text = (rows: string[]) => `${rows.join("\n")}\n`;

function build(command: string, raw: string) {
  const drops: Drop[] = [];
  const output = filterBuildOutput(raw, command, drops);
  return { output, lines: output?.split("\n") ?? [], drops };
}

const CARGO_WARNING = [
  "warning: unused variable: `x`",
  " --> src/main.rs:2:9",
  "  |",
  "2 |     let x = 5;",
  "  |         ^ help: if this is intentional, prefix it with an underscore: `_x`",
  "  |",
  "  = note: `#[warn(unused_variables)]` on by default",
];

const warning = (n: number, extra: number) => [
  `warning: unused import ${n}`,
  ...Array.from({ length: extra }, (_, i) => `  --> src/w${n}.rs:${i}`),
];

describe("filterBuildOutput keeps warnings", () => {
  it("keeps a tsc warning from a successful build", () => {
    const raw = text([
      "",
      "> demo@1.0.0 build",
      "> tsc",
      "",
      "src/a.ts(1,7): warning TS6133: 'x' is declared but its value is never read.",
    ]);
    const result = build("npm run build", raw);

    // npm's echo of the script is no diagnostic, and no noise either: it is kept after them.
    expect(result.output).toBe(
      "⚠️  1 warning(s):\nsrc/a.ts(1,7): warning TS6133: 'x' is declared but its value is never read.\n\n> demo@1.0.0 build\n> tsc",
    );
    expect(result.drops).toEqual([]);
  });

  it("keeps tsc's pretty warning with its source excerpt", () => {
    const pretty = ["src/a.ts:1:7 - warning TS6133: 'x' is declared but its value is never read.", "", "1 const x = 1;", "        ~"];
    expect(build("tsc --pretty", text([...pretty, "", "Found 1 warning."])).output).toBe(
      ["⚠️  1 warning(s):", ...pretty, "", "Found 1 warning."].join("\n"),
    );
  });

  it("keeps a tsc warning whose path holds a space", () => {
    const raw = text(["Building app", "src/my file.ts(1,7): warning TS6133: unused", "src/my file.ts:2:7 - warning TS6133: unused"]);
    expect(build("npm run build", raw).lines.slice(1)).toEqual([
      "⚠️  2 warning(s):",
      "src/my file.ts(1,7): warning TS6133: unused",
      "src/my file.ts:2:7 - warning TS6133: unused",
    ]);
  });

  it("reports one cargo warning as 1 warning, whole, beside the success line", () => {
    const raw = text([
      "   Compiling demo v0.1.0 (/tmp/demo)",
      ...CARGO_WARNING,
      "",
      'warning: `demo` (bin "demo") generated 1 warning (run `cargo fix --bin "demo"` to apply 1 suggestion)',
      "    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.31s",
    ]);
    const result = build("cargo build", raw);

    expect(result.output).toBe(["✓ Build successful (1 units compiled)", "⚠️  1 warning(s):", ...CARGO_WARNING].join("\n"));
    expect(result.drops).toEqual([]);
  });

  it("cuts nothing at the budget, and reports the first warning and line past it", () => {
    const atBudget = build("cargo build", text([warning(1, 9), ...[2, 3, 4, 5].map((n) => warning(n, 0))].flat()));
    expect(atBudget.lines).toHaveLength(15);
    expect(atBudget.drops).toEqual([]);

    const past = build("cargo build", text([warning(1, 10), ...[2, 3, 4, 5, 6].map((n) => warning(n, 0))].flat()));
    expect(past.lines).toContain("  ... and 1 more lines");
    expect(past.lines.at(-1)).toBe("... and 1 more warnings");
    expect(past.drops).toEqual([
      { count: 1, unit: "lines" },
      { count: 1, unit: "warnings" },
    ]);
  });

  it("keeps 5 of 7 warnings, cuts a long one at 10 lines, and reports both cuts", () => {
    const raw = text([warning(1, 12), ...[2, 3, 4, 5, 6, 7].map((n) => warning(n, 1))].flat());
    const result = build("cargo build", raw);

    expect(result.lines[0]).toBe("⚠️  7 warning(s):");
    expect(result.lines).toContain("  ... and 3 more lines");
    expect(result.lines).toContain("warning: unused import 5");
    expect(result.output).not.toContain("warning: unused import 6");
    expect(result.lines.at(-1)).toBe("... and 2 more warnings");
    expect(result.drops).toEqual([
      { count: 3, unit: "lines" },
      { count: 2, unit: "warnings" },
    ]);
  });

  it("keeps warnings beside errors", () => {
    const raw = text(["error[E0425]: cannot find value `y` in this scope", " --> src/main.rs:3:5", ...CARGO_WARNING]);
    const result = build("cargo build", raw);

    expect(result.output).toBe(
      [
        "❌ 1 error(s):",
        "error[E0425]: cannot find value `y` in this scope",
        " --> src/main.rs:3:5",
        "",
        "⚠️  1 warning(s):",
        ...CARGO_WARNING,
      ].join("\n"),
    );
  });
});
