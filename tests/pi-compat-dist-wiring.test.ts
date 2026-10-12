import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/pi-compatibility.yml", "utf8");
const agents = readFileSync("AGENTS.md", "utf8");

describe("independent-lane wiring for the dist entry", () => {
  it.each(["tests/pi-host-dist-entry.test.ts", "tests/package-tarball-dist.test.ts"])(
    "lists %s in the workflow and in the AGENTS.md reproduction command",
    (testFile) => {
      expect(workflow).toContain(testFile);
      expect(agents).toContain(testFile);
    },
  );
});
