import { expect, it } from "vitest";
import { runDistScenario, version } from "./helpers/pi-host-dist-harness.js";

function expectLane(stdout: string, scenario: string) {
  expect(stdout).toContain(`scenario=${scenario}=PASS`);
  expect(stdout).toContain(`host-version=${version};`);
}

it("falls back to index.ts through the host's manifest resolution when dist/ is absent", () => {
  expectLane(runDistScenario("fallback"), "fallback");
}, 130_000);

it("loads the built bundle through the host loader with the same tools as index.ts", () => {
  expectLane(runDistScenario("built"), "built");
}, 130_000);

// Negative control: the extension tree lacks Pi peers and typebox, so the bundle must fail outside the
// host's jiti transform + alias path. If a Pi loader change stops routing it there, "built" fails too.
it("the bundle only runs through the host's transform + alias path (negative control)", () => {
  const stdout = runDistScenario("negative");
  expectLane(stdout, "negative");
  expect(stdout).toContain("observed commonjs-typed host-load=ok");
}, 130_000);
