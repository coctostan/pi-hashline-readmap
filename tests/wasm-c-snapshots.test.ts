import { describe, expect, it } from "vitest";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cMapper } from "../src/readmap/mappers/c.js";
import type { FileMap } from "../src/readmap/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
function stable(map: FileMap): FileMap {
  return { ...map, path: basename(map.path) };
}

const cases = [
  ["simple", "wasm-c-simple.c"],
  ["representative", "wasm-c-representative.c"],
] as const;

describe("C WASM mapper snapshots", () => {
  for (const [name, fileName] of cases) {
    it(`maps ${name} C definitions`, async () => {
      const fixture = resolve(__dirname, "fixtures", fileName);
      const map = await cMapper(fixture);
      expect(map).not.toBeNull();
      expect(stable(map!)).toMatchSnapshot();
    });
  }

  it("resolves the constructs the regex mapper could not", async () => {
    const fixture = resolve(__dirname, "fixtures", "wasm-c-representative.c");
    const map = await cMapper(fixture);
    const names = map!.symbols.map((s) => s.name);
    expect(names).toContain("handler_t");
    expect(names).toContain("legacy_sum");
    expect(names).toContain("fatal");
    expect(names).toContain("checksum");
    const handler = map!.symbols.find((s) => s.name === "handler_t");
    expect(handler!.endLine).toBeGreaterThan(handler!.startLine);
  });
});
