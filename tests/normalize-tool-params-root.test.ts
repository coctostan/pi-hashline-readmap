import { describe, expect, it } from "vitest";
import { Type } from "typebox";
import { PTC_ERROR_CODES } from "../src/ptc-error-codes.js";
import {
  buildRequiredNullParameterError,
  normalizeToolParameters,
} from "../src/normalize-tool-params.js";

describe("normalizeToolParameters root object semantics", () => {
  it("removes only optional nulls while preserving required nulls, unknowns, and non-nullish values", () => {
    const schema = Type.Object({
      requiredNull: Type.String(),
      optionalNull: Type.Optional(Type.String()),
      requiredUndefined: Type.Any(),
      optionalUndefined: Type.Optional(Type.Any()),
      requiredZero: Type.Number(),
      optionalZero: Type.Optional(Type.Number()),
      requiredFalse: Type.Boolean(),
      optionalFalse: Type.Optional(Type.Boolean()),
      requiredEmptyString: Type.String(),
      optionalEmptyString: Type.Optional(Type.String()),
      requiredEmptyArray: Type.Array(Type.String()),
      optionalEmptyArray: Type.Optional(Type.Array(Type.String())),
    }, { additionalProperties: true });

    const input = {
      requiredNull: null,
      optionalNull: null,
      unknownNull: null,
      requiredUndefined: undefined,
      optionalUndefined: undefined,
      requiredZero: 0,
      optionalZero: 0,
      requiredFalse: false,
      optionalFalse: false,
      requiredEmptyString: "",
      optionalEmptyString: "",
      requiredEmptyArray: [],
      optionalEmptyArray: [],
    };

    const result = normalizeToolParameters(schema, input);

    expect(result.value).toEqual({
      requiredNull: null,
      unknownNull: null,
      requiredUndefined: undefined,
      optionalUndefined: undefined,
      requiredZero: 0,
      optionalZero: 0,
      requiredFalse: false,
      optionalFalse: false,
      requiredEmptyString: "",
      optionalEmptyString: "",
      requiredEmptyArray: [],
      optionalEmptyArray: [],
    });
    expect(result.requiredNull).toMatchObject({
      name: "requiredNull",
      schema: { type: "string" },
    });
    expect(buildRequiredNullParameterError("read", {
      name: "path",
      schema: Type.String(),
    })).toEqual({
      content: [{ type: "text", text: "Invalid path: expected string, received null." }],
      isError: true,
      details: {
        ptcValue: {
          tool: "read",
          ok: false,
          error: {
            code: "invalid-null",
            message: "Invalid path: expected string, received null.",
          },
        },
      },
    });
    expect(PTC_ERROR_CODES["invalid-null"]).toEqual({
      description: "A required parameter was supplied as JSON null",
      trigger: "a schema-required parameter is present with value null after optional-null normalization",
    });
  });
});
