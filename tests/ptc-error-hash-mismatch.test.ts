import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { computeLineHash } from "../src/hashline.js";

async function callEdit(params: Record<string, unknown>) {
  const { registerEditTool } = await import("../src/edit.js");
  let captured: any = null;
  const mockPi = { registerTool(def: any) { captured = def; } };
  registerEditTool(mockPi as any, { wasReadInSession: () => true });
  if (!captured) throw new Error("edit tool not registered");
  return captured.execute("tc", params, new AbortController().signal, () => {}, { cwd: process.cwd() });
}

describe("edit ptcValue.error — hash-mismatch with updatedAnchors", () => {

  it("returns hash-mismatch with PtcLine[] updatedAnchors in error.details", async () => {
    const dir = mkdtempSync(resolve(tmpdir(), "pi-edit-hm-"));
    const f = resolve(dir, "f.ts");
    writeFileSync(f, ["const a = 1;", "const b = 22;", "const c = 3;"].join("\n"), "utf-8");

    const staleHash = computeLineHash(2, "const b = 2;");
    const staleAnchor = `2:${staleHash}`;

    const r = await callEdit({
      path: f,
      edits: [{ set_line: { anchor: staleAnchor, new_text: "const b = 222;" } }],
    });

    expect(r.isError).toBe(true);
    const ptc = r.details?.ptcValue;
    expect(ptc?.tool).toBe("edit");
    expect(ptc?.ok).toBe(false);
    expect(ptc?.error?.code).toBe("hash-mismatch");
    expect(typeof ptc?.error?.message).toBe("string");
    expect(ptc.error.message).toContain("changed since last read");

    const anchors = ptc.error.details?.updatedAnchors;
    expect(Array.isArray(anchors)).toBe(true);
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(typeof a.line).toBe("number");
      expect(typeof a.hash).toBe("string");
      expect(typeof a.anchor).toBe("string");
      expect(typeof a.raw).toBe("string");
      expect(typeof a.display).toBe("string");
    }
    const changed = anchors.find((x: any) => x.line === 2);
    expect(changed).toBeDefined();
    expect(changed.hash).toBe(computeLineHash(2, "const b = 22;"));
  });
});
