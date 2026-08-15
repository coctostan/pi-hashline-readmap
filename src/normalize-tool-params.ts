import { Type, type TObject, type TSchema } from "typebox";
import { buildPtcError } from "./ptc-value.js";

export type RequiredNullParameter = {
  name: string;
  schema: TSchema;
};

export type NormalizeToolParametersResult = {
  value: unknown;
  requiredNull?: RequiredNullParameter;
};

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredKeys(schema: TObject): readonly string[] {
  return Array.isArray(schema.required) ? schema.required : [];
}

function matchingUnionVariant(schema: TSchema, value: unknown): TSchema | undefined {
  if (!Type.IsUnion(schema) || !isRecord(value)) return undefined;
  return schema.anyOf.find((candidate) =>
    Type.IsObject(candidate) &&
    requiredKeys(candidate).every((key) => hasOwn(value, key)),
  );
}

function visit(schema: TSchema, value: unknown, prefix = ""): NormalizeToolParametersResult {
  if (Type.IsUnion(schema)) {
    const variant = matchingUnionVariant(schema, value);
    return variant ? visit(variant, value, prefix) : { value };
  }

  if (Type.IsArray(schema) && Array.isArray(value)) {
    const next: unknown[] = [];
    let firstRequiredNull: RequiredNullParameter | undefined;

    for (let index = 0; index < value.length; index++) {
      const nested = visit(schema.items, value[index], `${prefix}[${index}]`);
      next.push(nested.value);
      firstRequiredNull ??= nested.requiredNull;
    }

    return { value: next, requiredNull: firstRequiredNull };
  }

  if (!Type.IsObject(schema) || !isRecord(value)) return { value };

  const required = new Set(requiredKeys(schema));
  const next: Record<string, unknown> = { ...value };
  let firstRequiredNull: RequiredNullParameter | undefined;

  for (const [key, property] of Object.entries(schema.properties)) {
    if (!hasOwn(value, key)) continue;
    const name = prefix ? `${prefix}.${key}` : key;

    if (value[key] === null) {
      if (required.has(key)) {
        firstRequiredNull ??= { name, schema: property };
      } else {
        delete next[key];
      }
      continue;
    }

    const nested = visit(property, value[key], name);
    next[key] = nested.value;
    firstRequiredNull ??= nested.requiredNull;
  }

  return { value: next, requiredNull: firstRequiredNull };
}

export function normalizeToolParameters(
  schema: TObject,
  parameters: unknown,
): NormalizeToolParametersResult {
  return visit(schema, parameters);
}

function expectedType(schema: TSchema): string {
  const type = (schema as { type?: unknown }).type;
  return typeof type === "string" ? type : "value";
}

export function buildRequiredNullParameterError(
  tool: string,
  parameter: RequiredNullParameter,
) {
  const message = `Invalid ${parameter.name}: expected ${expectedType(parameter.schema)}, received null.`;
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
    details: {
      ptcValue: {
        tool,
        ok: false,
        error: buildPtcError("invalid-null", message),
      },
    },
  };
}
