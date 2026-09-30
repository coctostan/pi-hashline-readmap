import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { buildRequiredNullParameterError, normalizeToolParameters } from "./normalize-tool-params.js";

export function withRawArgumentGuard(pi: ExtensionAPI): ExtensionAPI {
  const registerTool: ExtensionAPI["registerTool"] = (definition) => {
    const originalPrepareArguments = definition.prepareArguments;
    Object.defineProperty(definition, "prepareArguments", {
      configurable: true,
      enumerable: true,
      writable: true,
      value(args: unknown) {
        let value = args;
        if (Type.IsObject(definition.parameters)) {
          const normalized = normalizeToolParameters(definition.parameters, args);
          if (normalized.requiredNull) {
            const result = buildRequiredNullParameterError(definition.name, normalized.requiredNull);
            throw Object.assign(new Error(result.content[0].text), { code: "invalid-null" });
          }
          value = normalized.value;
        }
        return originalPrepareArguments ? originalPrepareArguments.call(definition, value) : value;
      },
    });
    pi.registerTool(definition);
  };
  return new Proxy(pi, {
    get(target, property, receiver) {
      return property === "registerTool" ? registerTool : Reflect.get(target, property, receiver);
    },
  });
}
