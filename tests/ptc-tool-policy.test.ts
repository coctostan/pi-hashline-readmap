import { describe, it, expect } from "vitest";
import { registerReadTool } from "../src/read.js";
import { registerGrepTool } from "../src/grep.js";
import { registerSgTool } from "../src/sg.js";
import { registerEditTool } from "../src/edit.js";
import { registerWriteTool } from "../src/write.js";
import { registerLsTool } from "../src/ls.js";
import { registerFindTool } from "../src/find.js";
import { NU_PTC } from "../src/nu.js";
import { HASHLINE_TOOL_PTC_POLICY, getHashlineToolPtcPolicy } from "../src/ptc-tool-policy.js";

// Every tool that ends up in the emitted executor map (index.ts toolExecutors),
// mapped to its live inline ptc. ast_search registers under the "ast_search"
// tool name via registerSgTool. nu registers conditionally, so its inline ptc
// (NU_PTC) is supplied directly rather than via registration.
function captureInlinePtc(): Record<string, any> {
  const tools: Record<string, any> = {};
  const pi = { registerTool(def: any) { tools[def.name] = def; } };
  registerReadTool(pi as any);
  registerGrepTool(pi as any);
  registerSgTool(pi as any);
  registerEditTool(pi as any);
  registerWriteTool(pi as any);
  registerLsTool(pi as any);
  registerFindTool(pi as any);
  const inline: Record<string, any> = {};
  for (const [name, def] of Object.entries(tools)) {
    expect(def.ptc, `tool "${name}" is missing an inline ptc block`).toBeDefined();
    inline[name] = def.ptc;
  }
  inline["nu"] = NU_PTC;
  return inline;
}

describe("hashline tool ptc policy drift guard", () => {
  it("getHashlineToolPtcPolicy returns the exported singleton", () => {
    expect(getHashlineToolPtcPolicy()).toBe(HASHLINE_TOOL_PTC_POLICY);
  });

  it("policy key set equals the live runtime tool set (incl. write and nu)", () => {
    const inline = captureInlinePtc();
    expect(Object.keys(HASHLINE_TOOL_PTC_POLICY.tools).sort()).toEqual(
      Object.keys(inline).sort(),
    );
  });

  it("each policy entry matches the live tool's inline ptc", () => {
    const inline = captureInlinePtc();
    for (const [name, entry] of Object.entries(HASHLINE_TOOL_PTC_POLICY.tools)) {
      const ptc = inline[name];
      expect(ptc, `no inline ptc for policy tool "${name}"`).toBeDefined();
      expect(entry.toolName, `toolName for "${name}"`).toBe(name);
      expect(entry.helperName, `helperName for "${name}"`).toBe(ptc.pythonName);
      expect(entry.mutability, `mutability for "${name}"`).toBe(ptc.policy);
      expect(entry.defaultExposure, `defaultExposure for "${name}"`).toBe(ptc.defaultExposure);
    }
  });
});
