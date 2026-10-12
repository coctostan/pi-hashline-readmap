import { describe, expect, it } from "vitest";
import {
  evaluateStartupGate,
  extractMeasurements,
  extractOutcome,
  gateFromRuns,
  median,
} from "../scripts/startup-bench-lib.mjs";

describe("median", () => {
  it("handles odd, even and unsorted input", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it("rejects empty input", () => {
    expect(() => median([])).toThrow("median requires at least one value");
  });
});

describe("evaluateStartupGate", () => {
  it("selects BUNDLE when the bundle clears the gate and lazy recovers < 80% of its gain", () => {
    const gate = evaluateStartupGate({ a: 0.19, b: 0.93, c: 0.8, d: 0.3, dCold: 1.0 });
    expect(gate.bundlePasses).toBe(true);
    expect(gate.bundleReduction).toBeCloseTo(0.851, 3);
    expect(gate.lazyShareOfBundle).toBeCloseTo(0.206, 3);
    expect(gate.outcome).toBe("BUNDLE");
  });

  it("selects LAZY when lazy recovers >= 80% of the bundle's gain", () => {
    const gate = evaluateStartupGate({ a: 0.19, b: 0.93, c: 0.4, d: 0.3, dCold: 1.0 });
    expect(gate.lazyShareOfBundle).toBeCloseTo(0.841, 3);
    expect(gate.outcome).toBe("LAZY");
  });

  it("selects NO-GO when warm overhead is reduced by less than 50%", () => {
    const gate = evaluateStartupGate({ a: 0.19, b: 0.93, c: 0.9, d: 0.7, dCold: 1.0 });
    expect(gate.bundleReduction).toBeCloseTo(0.311, 3);
    expect(gate.outcome).toBe("NO-GO");
  });

  it("selects NO-GO when the cold first load overhead is 2.0 s or more", () => {
    expect(evaluateStartupGate({ a: 0, b: 1, c: 0.9, d: 0.5, dCold: 2 }).outcome).toBe("NO-GO");
    expect(evaluateStartupGate({ a: 0, b: 1, c: 0.9, d: 0.5, dCold: 1.99 }).outcome).toBe("BUNDLE");
  });

  it("treats exactly 50% as passing and a non-positive baseline overhead as NO-GO", () => {
    expect(evaluateStartupGate({ a: 0, b: 1, c: 0.9, d: 0.5, dCold: 1 }).bundlePasses).toBe(true);
    expect(evaluateStartupGate({ a: 1, b: 1, c: 1, d: 1, dCold: 1 }).outcome).toBe("NO-GO");
  });
});

describe("gateFromRuns", () => {
  it("uses warm medians for a/b/c/d and the cold median for d", () => {
    const runs = {
      a: { warm: [0.2, 0.19, 0.18], cold: [0.2, 0.2, 0.2] },
      b: { warm: [0.9, 0.93, 0.95], cold: [1.6, 1.6, 1.6] },
      c: { warm: [0.8, 0.8, 0.8], cold: [1.5, 1.5, 1.5] },
      d: { warm: [0.3, 0.31, 0.29], cold: [1.0, 1.1, 1.2] },
    };
    const gate = gateFromRuns(runs);
    expect(gate.coldOverhead).toBeCloseTo(1.1 - 0.19, 5);
    expect(gate.outcome).toBe("BUNDLE");
  });
});

describe("doc extraction", () => {
  const doc = [
    "# Startup",
    "Outcome: BUNDLE",
    "```json startup-measurements",
    '{"piVersion":"1.1.0"}',
    "```",
  ].join("\n");

  it("extracts exactly one outcome line", () => {
    expect(extractOutcome(doc)).toBe("BUNDLE");
    expect(extractOutcome("Outcome: BUNDLE\nOutcome: NO-GO\n")).toBeNull();
    expect(extractOutcome("no outcome here")).toBeNull();
  });

  it("extracts the measurements block", () => {
    expect(extractMeasurements(doc)).toEqual({ piVersion: "1.1.0" });
    expect(extractMeasurements("nothing")).toBeNull();
  });
});
