import { describe, expect, it } from "vitest";
import { makeStrictJsonSchema, resolveJsonSchemaStrictSampling } from "@earendil-works/pi-ai/api/constrained-sampling";
import {
  createBashToolDefinition,
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
} from "@earendil-works/pi-coding-agent";
import init from "../index.js";

const builtIns = {
  read: createReadToolDefinition,
  edit: createEditToolDefinition,
  write: createWriteToolDefinition,
  bash: createBashToolDefinition,
};

// The definitions as the host receives them, after the codemode and raw-argument wrappers.
const tools = new Map<string, any>();
init({ registerTool(definition: any) { tools.set(definition.name, definition); }, on() {}, events: { emit() {}, on() {} } } as any);

describe("constrained sampling on replaced built-ins", () => {
  it("requests the built-in's own constrained sampling on read, edit, write and bash", () => {
    for (const [name, create] of Object.entries(builtIns)) {
      const builtIn = create(process.cwd()).constrainedSampling;
      expect(builtIn, name).toEqual({ type: "json_schema", strict: "prefer" });
      expect(tools.get(name)?.constrainedSampling, name).toEqual(builtIn);
    }
  });

  it("is sent strict for read, write and bash, and non-strict for edit", () => {
    for (const name of ["read", "write", "bash"]) {
      expect(() => makeStrictJsonSchema(tools.get(name).parameters), name).not.toThrow();
      expect(resolveJsonSchemaStrictSampling(tools.get(name), true), name).toBe(true);
    }
    // edit's schema-valued additionalProperties fails conversion, so "prefer" falls back.
    expect(() => makeStrictJsonSchema(tools.get("edit").parameters)).toThrow(/additionalProperties/);
    expect(resolveJsonSchemaStrictSampling(tools.get("edit"), true)).toBeUndefined();
  });
});
