import type { TLiteral, TObject } from "typebox";

function withKeyFirst<T extends object>(schema: T, firstKey: string | symbol): T {
  const keys = Reflect.ownKeys(schema);
  if (!keys.includes(firstKey)) return schema;

  const reordered = Object.create(Object.getPrototypeOf(schema));
  for (const key of [firstKey, ...keys.filter((key) => key !== firstKey)]) {
    Object.defineProperty(reordered, key, Object.getOwnPropertyDescriptor(schema, key)!);
  }
  return reordered as T;
}

/** Preserve the JSON key order emitted by legacy TypeBox for shape-hash compatibility. */
export function withLegacyLiteralOrder<T extends TLiteral>(schema: T): T {
  return withKeyFirst(schema, "const");
}

/** Preserve legacy ordering when object options include additionalProperties. */
export function withLegacyObjectOrder<T extends TObject>(schema: T): T {
  return withKeyFirst(schema, "additionalProperties");
}

/** Preserve legacy ordering when object options override required. */
export function withLegacyRequiredOrder<T extends TObject>(schema: T): T {
  return withKeyFirst(schema, "required");
}
