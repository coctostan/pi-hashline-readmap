type UnknownRecord = Record<string, unknown>;

type ProviderModelIdentity = {
  provider?: unknown;
  id?: unknown;
};

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasReadProperties(properties: UnknownRecord): boolean {
  return ["path", "offset", "limit", "symbol", "map", "bundle"].every(
    (name) => properties[name] !== undefined,
  );
}

// sub2api GPT fills every optional field in the flat Read schema; expose the real modes on the wire.

export function rewriteReadSchemaForProvider(
  payload: unknown,
  model: ProviderModelIdentity | undefined,
): unknown {
  if (
    model?.provider !== "sub2api" ||
    model?.id !== "gpt-5.6-sol" ||
    !isRecord(payload) ||
    !Array.isArray(payload.tools)
  ) {
    return payload;
  }

  const readIndex = payload.tools.findIndex(
    (tool) => isRecord(tool) && tool.name === "read",
  );
  if (readIndex < 0) return payload;

  const readTool = payload.tools[readIndex];
  if (!isRecord(readTool) || !isRecord(readTool.parameters)) return payload;

  const properties = readTool.parameters.properties;
  if (!isRecord(properties) || !hasReadProperties(properties)) return payload;

  const parameters = {
    oneOf: [
      {
        type: "object",
        required: ["path"],
        additionalProperties: false,
        properties: {
          path: properties.path,
          offset: properties.offset,
          limit: properties.limit,
          map: properties.map,
        },
      },
      {
        type: "object",
        required: ["path", "symbol"],
        additionalProperties: false,
        properties: {
          path: properties.path,
          symbol: properties.symbol,
          bundle: properties.bundle,
        },
      },
    ],
  };
  const tools = [...payload.tools];
  tools[readIndex] = { ...readTool, parameters };

  return { ...payload, tools };
}
