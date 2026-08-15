import { describe, expect, it } from "vitest";
import { Type } from "typebox";
import { normalizeToolParameters } from "../src/normalize-tool-params.js";

describe("normalizeToolParameters recursive semantics", () => {
  it("normalizes nested objects and array items through matching union variants only", () => {
    const editItem = Type.Union([
      Type.Object({
        insert_after: Type.Object({
          anchor: Type.String(),
          new_text: Type.String(),
          text: Type.Optional(Type.String()),
        }, { additionalProperties: true }),
      }, { additionalProperties: true }),
      Type.Object({
        replace: Type.Object({
          old_text: Type.String(),
          new_text: Type.String(),
          all: Type.Optional(Type.Boolean()),
          fuzzy: Type.Optional(Type.Boolean()),
        }, { additionalProperties: true }),
      }, { additionalProperties: true }),
    ]);
    const schema = Type.Object({
      nested: Type.Object({
        required: Type.String(),
        optional: Type.Optional(Type.Boolean()),
      }),
      edits: Type.Array(editItem),
    });
    const unmatched = { mystery: { optional: null } };

    const result = normalizeToolParameters(schema, {
      nested: { required: "yes", optional: null },
      edits: [
        {
          insert_after: {
            anchor: "1:abc",
            new_text: "next",
            text: null,
            unknown: null,
          },
        },
        {
          replace: {
            old_text: "old",
            new_text: "new",
            all: null,
            fuzzy: null,
          },
        },
        unmatched,
      ],
    });

    expect(result.requiredNull).toBeUndefined();
    expect(result.value).toEqual({
      nested: { required: "yes" },
      edits: [
        {
          insert_after: {
            anchor: "1:abc",
            new_text: "next",
            unknown: null,
          },
        },
        {
          replace: {
            old_text: "old",
            new_text: "new",
          },
        },
        unmatched,
      ],
    });
    expect((result.value as { edits: unknown[] }).edits[2]).toBe(unmatched);
  });
});
