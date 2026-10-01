# Pi host API adoption audit

## Gemini parameter schemas

This audit covers registered parameters, not output schemas. The installed
`node_modules/@earendil-works/pi-ai/dist/api/google-shared.js:260–267`
documents the default `parametersJsonSchema` path as supporting full JSON Schema,
including anyOf, oneOf and const. Its declaration in
`dist/api/google-shared.d.ts` is `convertTools(tools: Tool[], useParameters?:
boolean, supportsStrictMode?: boolean): { functionDeclarations:
Record<string, unknown>[] }[] | undefined`. We select
`convertTools(tools, false, false)`: JSON Schema declarations, strict mode disabled.

Separately, `dist/utils/typebox-helpers.{js,d.ts}` recommends StringEnum for
Google/provider portability: `StringEnum<T extends readonly string[]>(values: T,
options?: { description?: string; default?: T[number] }): TUnsafe<T[number]>`.
We adopt this conservative string-enum representation for the four audited enum
fields as required by this change, without claiming the current default converter
rejects their old shapes. Numeric/string and nested object anyOf unions are
retained under the documented parametersJsonSchema rules.

Conversion alone does not validate remote API acceptance. The deterministic
regression checks this project's audited portable subset (typed objects, arrays,
primitives, string enums, required/properties, additionalProperties and recursive
anyOf branches), not Google's complete schema rules. Excluding a construct from
that subset is not evidence Pi's JSON Schema path rejects it. The negative control
uses an unknown primitive type, not a blacklist of supported JSON Schema keywords.
Relevant Google references: FunctionDeclaration.parametersJsonSchema is a JSON
Schema value; legacy Schema documents typed properties, items, enum and anyOf:
https://ai.google.dev/api/generate-content#FunctionDeclaration
https://ai.google.dev/api/generate-content#Schema
https://ai.google.dev/gemini-api/docs/function-calling

| Source | Registered path | Before | Selected JSON Schema path result | Migration/portability decision |
| --- | --- | --- | --- | --- |
| src/read.ts | read.bundle | string const local | Supported by documented const rule | StringEnum(["local"]); retain description and optionality |
| src/grep.ts | grep.scope | string const symbol | Supported by documented const rule | StringEnum(["symbol"]); retain description and optionality |
| src/find.ts | find.type | anyOf string const file/dir/any | Supported by documented anyOf/const rules | StringEnum(["file","dir","any"]) |
| src/find.ts | find.sortBy | anyOf string const name/mtime/size | Supported by documented anyOf/const rules | StringEnum(["name","mtime","size"]) |
| src/read.ts | read.offset | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/read.ts | read.limit | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/grep.ts | grep.context | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/grep.ts | grep.limit | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/grep.ts | grep.scopeContext | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/find.ts | find.limit | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/find.ts | find.minSize | anyOf number/string | Supported by documented anyOf rule | Retain unit-bearing strings |
| src/find.ts | find.maxSize | anyOf number/string | Supported by documented anyOf rule | Retain unit-bearing strings |
| src/ls.ts | ls.limit | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/sg.ts | ast_search.limit | anyOf number/string | Supported by documented anyOf rule | Retain |
| src/edit.ts | edit.edits.items | anyOf six object branches | Supported by documented anyOf rule | Retain complete nested structure and branch order |

The edit branches are set_line, replace_lines, insert_after, replace,
replace_symbol, and legacy top-level old_text/new_text. Keep their
required fields, optional text/all/fuzzy, descriptions, and
additionalProperties behavior unchanged.

No other literal or union schema sites occur in these six parameter schemas.
find.maxDepth remains a number schema whose runtime also accepts obvious
base-10 strings; do not widen or otherwise change that pre-existing contract
in this compatibility migration.

All ten numeric/string unions were checked before migration and are retained.
Only four string-literal schema shapes change. No input values are removed.
Object/property and required-field ordering elsewhere must remain stable.
Optional nulls remain omitted by normalizeToolParameters/withRawArgumentGuard;
required nulls remain rejected before host coercion. Host preparation failures
still cannot carry the direct-tool structured error metadata; see
structured-output.md#required-nulls-at-the-host-boundary.

## Scope boundaries

No credentials or live Gemini requests are required. This is deterministic
coverage of Pi's declaration path plus supported schema rules, not a claim
that every model or provider lifecycle branch was exercised. Cache locations,
custom agent-directory overrides, renderer interaction, and unrelated schema
simplifications are unchanged.

## Rendering and settings decisions

Shared hints call keyHint("app.tools.expand", "to expand") on demand via
src/tui-render-utils.ts:getExpandHint. Summaries and collapsed previews reuse
it; collapsed diff rendering uses the same helper. Pi controls spelling and
styling (the standard Ctrl+O binding is displayed as ctrl+o). A longer binding
may cause an existing narrow-width diff fallback to omit the shortcut.
Collapsed preview hints are clamped using visible terminal width. The diff
component's cache includes the current hint so a binding change at the same
viewport width is observable without reloading the module.
Expanded diff components do not resolve hints or depend on Pi's global theme;
only collapsed output uses the hint as a cache discriminator. When the host
expansion action has no configured shortcut, the shared helper omits the
shortcut suffix while retaining hidden-line and hunk counts.

Legacy identity-theme renderer tests use a deterministic keyHint fixture to
isolate their content/count assertions. Real hint tests explicitly unmock Pi,
initialize its theme, and mutate the host's own keybinding singleton between
renders. The locked host may have a nested pi-tui installation; changing only
the repo-root singleton does not exercise keyHint's real binding state.

Settings path builders use CONFIG_DIR_NAME for only the directory component.
Suffixes remain agent/hashline-readmap/settings.json globally and
hashline-readmap/settings.json in the project. Cache paths and custom agent-dir
overrides are not part of this change. Path overrides, validation, warnings,
field-wise merging, environment precedence, and shell fallback remain intact.

## Required verification

- npm test
- npm run typecheck
- npm test -- tests/pi-extension-load-compatibility.test.ts tests/pi-host-null-pipeline.test.ts
- Independently install exactly Pi 1.0.0 and its complete pinned Pi graph into
  temporary storage, then run tests/pi-host-null-pipeline.test.ts and
  tests/pi-host-codemode.test.ts with PI_COMPAT_HOST and PI_COMPAT_REQUIRE_NU=1
  (see AGENTS.md).

The locked development-host lane and .github/workflows/pi-compatibility.yml's
independent Pi 1.0.0 lane are complementary. Keep the npm 11/12 packing matrix,
current-host version checks, optional Nu requirement, and existing loader tests.
Neither lane may silently fall back to or replace the other. Credentials and a
live Gemini smoke test are not required.

| Acceptance criteria | Evidence |
| --- | --- |
| 1, 3 | Audit inventory and pre-migration numeric-union probe |
| 2, 4, 8 | Tasks 2–4 and 12: read-bundle-schema.test.ts, grep-symbol-scope-schema.test.ts, focused find enum cases in gemini-parameter-schemas.test.ts; Task 16: unchanged serialization/order hashes |
| 3, 5, 6 | Tasks 14–15: separate numeric-input and null/edit cases in gemini-parameter-schemas.test.ts; existing null-params-edit.test.ts and pi-host-null-pipeline.test.ts |
| 7 | Task 13: real Google parametersJsonSchema conversion plus recursive audited portable-subset checks and unknown-type negative control (not a complete Google validator); Task 14: numeric branch shapes |
| 9, 10, 11 | tui-render-utils.test.ts, build-collapsed-preview.test.ts, tui-diff-renderer.test.ts, tui-diff-component.test.ts |
| 12 | Real-hint width regressions plus existing narrow/expanded/content-count renderer tests |
| 13, 14 | Task 10: no-override default-path checks in hashline-settings-host-directory.test.ts |
| 15, 16 | Tasks 17–19: separate validation/warning, independent/both override and environment/fallback cases in hashline-settings-host-directory.test.ts; existing settings/env/fallback files remain intact |
| 17 | These full suite/typecheck and both host gates, repeated after all split test additions by Task 19 |
