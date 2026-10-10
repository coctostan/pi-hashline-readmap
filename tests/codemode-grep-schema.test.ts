import { expect, it } from "vitest";
import { Value } from "typebox/value";
import { HASHLINE_TOOL_OUTPUT_SCHEMAS } from "../src/codemode-integration.js";

it("requires the advertised grep completeness dimensions", () => {
  const schema: any = HASHLINE_TOOL_OUTPUT_SCHEMAS.grep;
  const success = schema.properties ? schema : schema.anyOf?.find((s: any) => s.properties?.completeness);
  if (!success?.properties?.completeness) throw new Error("Grep schema omits completeness");
  const value = { text: "", totalMatches: 0, records: [], completeness: {
    search: "complete", limitReached: false, nativeTruncated: false, omittedMatches: 0, displayTruncated: false,
  } };
  expect(Value.Check(schema, value)).toBe(true);
  expect(Value.Check(schema, { ...value, completeness: { ...value.completeness, search: "unknown", omittedMatches: null } })).toBe(true);
  const { completeness, ...missing } = value;
  expect(Value.Check(schema, missing)).toBe(false);
  for (const key of Object.keys(completeness)) {
    const partial: any = { ...completeness };
    delete partial[key];
    expect(Value.Check(schema, { ...value, completeness: partial })).toBe(false);
  }
});
