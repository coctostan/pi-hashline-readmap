import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { it } from "vitest";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { registerReadTool } from "../src/read.js";
import { registerGrepTool } from "../src/grep.js";
import { registerEditTool } from "../src/edit.js";
import { registerFindTool } from "../src/find.js";
import { registerLsTool } from "../src/ls.js";
import { registerSgTool } from "../src/sg.js";
import { withRawArgumentGuard } from "../src/raw-argument-guard.js";
import { normalizeToolParameters } from "../src/normalize-tool-params.js";

function registeredTools(): any[] {
  const tools: any[] = [];
  const pi = withRawArgumentGuard({ registerTool(tool: any) { tools.push(tool); } } as any);
  registerReadTool(pi);
  registerGrepTool(pi);
  registerEditTool(pi);
  registerFindTool(pi);
  registerLsTool(pi);
  registerSgTool(pi);
  return tools;
}
function base(tool: any): Record<string, unknown> {
  return Object.fromEntries((tool.parameters.required ?? []).map((key: string) =>
    [key, key === "path" ? "sample.ts" : "*"]));
}
function validate(tool: any, args: Record<string, unknown>) {
  return validateToolArguments(tool, {
    type: "toolCall", id: "schema", name: tool.name,
    arguments: tool.prepareArguments(args),
  });
}
function assertEnum(tool: any, key: string, values: string[], description: string): void {
  assert.equal(tool.parameters.properties[key].type, "string");
  assert.deepEqual(JSON.parse(JSON.stringify(tool.parameters.properties[key])),
    { type: "string", enum: values, description });
  assert.ok(!(tool.parameters.required ?? []).includes(key));
  assert.doesNotThrow(() => validate(tool, base(tool)));
  for (const value of values) {
    assert.doesNotThrow(() => validate(tool, { ...base(tool), [key]: value }));
  }
  for (const value of ["INVALID", "", 42, false]) {
    assert.throws(() => validate(tool, { ...base(tool), [key]: value }));
  }
}
it("generates and validates find.type as a portable string enum", () => {
  const find = registeredTools().find(tool => tool.name === "find");
  assertEnum(find, "type", ["file", "dir", "any"], "Entry type filter");
});

it("generates and validates find.sortBy as a portable string enum", () => {
  const find = registeredTools().find(tool => tool.name === "find");
  assertEnum(find, "sortBy", ["name", "mtime", "size"], "Sort key");
});

// This is this project's audited portable subset, NOT a complete Google validator.
// Grounding: Pi google-shared.js documents full JSON Schema for parametersJsonSchema;
// Google's FunctionDeclaration.parametersJsonSchema and Schema document typed
// properties/items, required keys, string enums and anyOf. No claim that Pi
// necessarily rejects JSON Schema keywords outside this subset.
function checkAuditedPortableSubset(schema: any): void {
  assert.ok(schema && typeof schema === "object" && !Array.isArray(schema));
  for (const keyword of ["const", "$ref", "oneOf", "allOf", "not"]) {
    assert.ok(!(keyword in schema), "outside project's audited portable subset: " + keyword);
  }
  if (schema.anyOf) {
    assert.ok(Array.isArray(schema.anyOf) && schema.anyOf.length > 0);
    schema.anyOf.forEach(checkAuditedPortableSubset);
  } else {
    assert.ok(["object", "array", "string", "number", "integer", "boolean"].includes(schema.type),
      "invalid primitive type in audited subset: " + schema.type);
  }
  if (schema.enum) {
    assert.equal(schema.type, "string");
    assert.ok(schema.enum.length > 0 && schema.enum.every((v: unknown) => typeof v === "string"));
  }
  if (schema.type === "object") {
    assert.ok(schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties));
    assert.ok((schema.required ?? []).every((key: string) => key in schema.properties));
    if ("additionalProperties" in schema) {
      assert.equal(typeof schema.additionalProperties, "boolean");
    }
    Object.values(schema.properties).forEach(checkAuditedPortableSubset);
  }
  if (schema.type === "array") checkAuditedPortableSubset(schema.items);
}
async function googleDeclarations(tools: any[]): Promise<any[]> {
  const { convertTools } = await import(
    new URL("./api/google-shared.js", import.meta.resolve("@earendil-works/pi-ai")).href
  );
  return convertTools(tools, false, false)[0].functionDeclarations;
}
it("pins all four portable enum slots independently of compatibility", () => {
  const byName = Object.fromEntries(registeredTools().map(tool => [tool.name, tool]));
  assertEnum(byName.read, "bundle", ["local"], "local; requires symbol; valid with limit and map");
  assertEnum(byName.grep, "scope", ["symbol"], "symbol only; enables scopeContext");
  assertEnum(byName.find, "type", ["file", "dir", "any"], "Entry type filter");
  assertEnum(byName.find, "sortBy", ["name", "mtime", "size"], "Sort key");
});
it("checks six Google JSON Schema declarations against the audited portable subset", async () => {
  const declarations = await googleDeclarations(registeredTools());
  assert.deepEqual(declarations.map(d => d.name), ["read", "grep", "edit", "find", "ls", "ast_search"]);
  assert.throws(() => checkAuditedPortableSubset({ type: "not-a-json-schema-type" }),
    /invalid primitive type in audited subset: not-a-json-schema-type/);
  assert.throws(() => checkAuditedPortableSubset({ enum: ["broken"] }));
  // Const is allowed by the selected Pi path; this control checks ONLY our enum
  // portability policy. It is not evidence of rejection by Google or Pi.
  assert.throws(() => checkAuditedPortableSubset({ type: "string", const: "broken" }),
    /outside project's audited portable subset: const/);
  for (const declaration of declarations) {
    assert.ok(declaration.parametersJsonSchema);
    assert.equal(declaration.parametersJsonSchema.type, "object");
    assert.equal(declaration.parameters, undefined);
    checkAuditedPortableSubset(declaration.parametersJsonSchema);
  }
  const editSchema = declarations.find(d => d.name === "edit").parametersJsonSchema;
  assert.deepEqual(editSchema.properties.edits.items.anyOf.map((s: any) => s.required),
    [["set_line"], ["replace_lines"], ["insert_after"], ["replace"], ["replace_symbol"], ["old_text", "new_text"]]);
});

it("retains all ten numeric/string schemas and accepted inputs", async () => {
  const tools = registeredTools();
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]));
  const declarations = await googleDeclarations(tools);
  const numeric: Record<string, string[]> = {
    read: ["offset", "limit"],
    grep: ["context", "limit", "scopeContext"],
    edit: [],
    find: ["limit", "minSize", "maxSize"],
    ls: ["limit"],
    ast_search: ["limit"],
  };
  let checked = 0;
  for (const declaration of declarations) {
    const tool = byName[declaration.name];
    for (const key of numeric[declaration.name]) {
      const schema = declaration.parametersJsonSchema.properties[key];
      checkAuditedPortableSubset(schema);
      assert.deepEqual(schema.anyOf.map((branch: any) => branch.type), ["number", "string"]);
      for (const value of [2, "2"]) {
        assert.doesNotThrow(() => validate(tool, { ...base(tool), [key]: value }));
      }
      checked++;
    }
  }
  assert.equal(checked, 10);
  for (const key of ["minSize", "maxSize"]) {
    assert.doesNotThrow(() => validate(byName.find, { pattern: "*", [key]: "1KB" }));
  }
  // maxDepth's pre-existing schema/runtime mismatch is not a union migration.
  assert.equal(byName.find.parameters.properties.maxDepth.type, "number");
});

it("preserves optional and required top-level null preparation for six tools", () => {
  for (const tool of registeredTools()) {
    const raw = { ...base(tool) };
    for (const key of Object.keys(tool.parameters.properties)) {
      if (!(tool.parameters.required ?? []).includes(key)) raw[key] = null;
    }
    const before = structuredClone(raw);
    assert.deepEqual(tool.prepareArguments(raw), base(tool));
    assert.deepEqual(raw, before);
    assert.doesNotThrow(() => validate(tool, raw));
    for (const key of tool.parameters.required ?? []) {
      assert.throws(() => validate(tool, { ...base(tool), [key]: null }),
        (error: any) => error.code === "invalid-null" &&
          error.message === `Invalid ${key}: expected string, received null.`);
    }
  }
});
it("preserves six edit variants and nested required-null diagnostics", () => {
  const edit = registeredTools().find(tool => tool.name === "edit");
  const branches = edit.parameters.properties.edits.items.anyOf;
  assert.deepEqual(branches.map((s: any) => s.required),
    [["set_line"], ["replace_lines"], ["insert_after"], ["replace"], ["replace_symbol"], ["old_text", "new_text"]]);
  const items = [
    { set_line: { anchor: "1:abc", new_text: "beta" } },
    { replace_lines: { start_anchor: "1:abc", end_anchor: "2:def", new_text: "beta" } },
    { insert_after: { anchor: "1:abc", new_text: "beta", text: null } },
    { replace: { old_text: "alpha", new_text: "beta", all: null, fuzzy: null } },
    { replace_symbol: { symbol: "demo", new_body: "function demo() {}" } },
    { old_text: "alpha", new_text: "beta" },
  ];
  for (const [index, item] of items.entries()) {
    const raw = { path: "sample.ts", edits: [item], postEditVerify: null };
    const normalized = normalizeToolParameters(edit.parameters, raw);
    assert.equal(normalized.requiredNull, undefined);
    assert.doesNotThrow(() => validate(edit, raw));
    const prepared = edit.prepareArguments(raw);
    assert.equal("postEditVerify" in prepared, false);
    if (index === 2) assert.equal("text" in prepared.edits[0].insert_after, false);
    if (index === 3) {
      assert.equal("all" in prepared.edits[0].replace, false);
      assert.equal("fuzzy" in prepared.edits[0].replace, false);
    }
    const branch = branches[index];
    for (const outer of branch.required) {
      const bad = structuredClone(item) as any;
      bad[outer] = null;
      assert.throws(() => validate(edit, { path: "sample.ts", edits: [bad] }),
        (error: any) => error.code === "invalid-null");
      const inner = branch.properties[outer];
      if (inner.type === "object") {
        for (const required of inner.required) {
          const badInner = structuredClone(item) as any;
          badInner[outer][required] = null;
          const args = { path: "sample.ts", edits: [badInner] };
          const result = normalizeToolParameters(edit.parameters, args);
          assert.equal(result.requiredNull?.name, `edits[0].${outer}.${required}`);
          assert.throws(() => validate(edit, args),
            (error: any) => error.code === "invalid-null" &&
              error.message === `Invalid edits[0].${outer}.${required}: expected string, received null.`);
        }
      }
    }
  }
});

it("preserves schema serialization and order outside the four enum slots", () => {
  const hashes: Record<string, string> = {
    read: "718b9697cd227aa4c46bafeb86095ea78641a6290f2e98131dcfe528048c57a2",
    grep: "aa55ce8f4607f8e3e87f0edcbb7b407f5795b2ca84b8f72f723343ed0b7e5fd3",
    edit: "f4e96f90cf75191050ba69e0aa760bffc461d4b2c77718c2cb838fc584834d31",
    find: "55e357e9e6d0695269d493def3d8e5af78d670ad16dc1472b42e1ee83c0e6b58",
    ls: "9ecf497c631527ff13de80c6eae5983d8de868ceed01ea750c406dcf057be77e",
    ast_search: "341c5cd7c9a3ddb13cdb1067e04d802c8f5c29f4d3fb6d75b77429a36f9648f7",
  };
  const enumSlots = [["read", "bundle"], ["grep", "scope"], ["find", "type"], ["find", "sortBy"]];
  for (const tool of registeredTools()) {
    const schema = JSON.parse(JSON.stringify(tool.parameters));
    for (const [name, key] of enumSlots) {
      if (name === tool.name) schema.properties[key] = {};
    }
    assert.equal(createHash("sha256").update(JSON.stringify(schema)).digest("hex"), hashes[tool.name]);
  }
});
