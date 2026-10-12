import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractMeasurements, extractOutcome, gateFromRuns } from "../scripts/startup-bench-lib.mjs";

const docPath = "docs/startup-performance.md";
const doc = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
const outcome = extractOutcome(doc);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("startup performance record (#267)", () => {
  it("exists and records host, Pi version, the gate computation and raw measurements", () => {
    expect(doc, "docs/startup-performance.md must exist").not.toBe("");
    expect(doc).toContain("Pi 1.1.0");
    expect(doc).toContain("## Gate computation");
    const measurements = extractMeasurements(doc);
    expect(measurements).not.toBeNull();
    expect(measurements.piVersion).toBe("1.1.0");
    for (const variant of ["a", "b", "c", "d"]) {
      for (const mode of ["warm", "cold"]) {
        expect(measurements.runs[variant][mode].length, `${variant} ${mode}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("records exactly one outcome that matches the gate recomputed from the raw runs", () => {
    expect(outcome).not.toBeNull();
    expect(gateFromRuns(extractMeasurements(doc).runs).outcome).toBe(outcome);
  });

  it.runIf(outcome === "NO-GO" || outcome === "LAZY")("ships no build pieces unless the outcome is BUNDLE", () => {
    expect(existsSync("scripts/build.mjs")).toBe(false);
    expect(pkg.scripts.build).toBeUndefined();
    expect(pkg.scripts.prepare).toBeUndefined();
    expect(pkg.devDependencies.esbuild).toBeUndefined();
    expect(pkg.pi.extensions).toEqual(["./index.ts"]);
    expect(pkg.files).not.toContain("dist/");
  });
});
