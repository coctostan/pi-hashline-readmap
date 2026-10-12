# Bundled Nu deprecation and migration

Bundled `nu` is deprecated, not removed. Hashline remains focused on anchored editing, structural reads, file exploration, and efficient command output. Existing Nu registration and execution behavior remain unchanged during deprecation.

[Back to README](../README.md) · [Tested codemode recipes](codemode-recipes.md)

## Removal gate

Nu remains available for at least one published deprecation release. Removal occurs only in a separately announced breaking release after migration-example verification and the removal checklist pass. No numerical removal version is committed.

An Unreleased changelog entry or merged source change is not evidence of a published deprecation release. Before removal ships, record the published deprecation version, its announcement, the later breaking-release announcement, verification results, and completion of the checklist below.

## Replacement routing

| Need | Preferred path | Boundary |
| --- | --- | --- |
| Source inspection and anchored search | `read`, `grep`, `ast_search` | Keep fresh anchors, read warnings/continuation, grep completeness, and AST truncation. |
| File discovery | `ls` for one directory; `find` for recursive basename matching and supported size/mtime filters/sorting | Entries expose names/paths and types, not arbitrary filesystem metadata. |
| Filter, join, or aggregate tool results | Codemode JavaScript over structured results | No direct filesystem/process access; tools supply outside-world capabilities. |
| External CLIs | `bash`, with JSON processed in codemode when appropriate | Check exit code, native truncation, recovery path, output bounds, and JSON validity before summarizing. |

The bounded executable examples live in [codemode recipes](codemode-recipes.md), not duplicated untested code here. Nushell JSON/CSV/TOML/YAML parsing, plugins, system queries, and shell pipelines are not universally replaced by codemode or file tools. Use `read` for repository files; use Bash for genuine external commands, not a new general file-reading pipeline.

Enable codemode additively on Pi 1.1 with `pi --tools +codemode`, retaining existing tool selection. The callable tools must be available. Codemode does not bypass permission guards, argument validation, or cancellation. Dependent mutations must run serially with freshly acquired anchors after each mutation; a stored anchor is not evidence of current file state. Handle read result variants before accessing lines.

## Keeping Nushell

During deprecation, existing bundled Nu users need not change settings: the `nushell` regular dependency remains installed, the tool registers only when the binary is usable, and bundled-first resolution still falls back to `nu` on PATH. `PI_NUSHELL_CONFIG`, then `~/.config/pi/nushell/config.nu`, then `--no-config-file` retain their existing precedence.

Nushell remains available as a standalone CLI. Install it independently if you need it after bundled removal; do not rely on Hashline's private npm dependency path. For an external Nushell command, a Bash invocation such as `nu --no-config-file -c '[1 2 3] | math sum'` is available when `nu` is installed on PATH. This is specialist shell use, not preferred source-file exploration. Hashline's `PI_NUSHELL_CONFIG` does not automatically configure your standalone command: pass your desired config explicitly.

A separate optional extension is a possible destination, not a prerequisite for this deprecation. This project does not promise or endorse a verified maintained replacement package.

### Avoid conflicting registrations

Do not load two extensions registering the same `nu` name. Hashline currently has no Nu-only registration-disable setting; selecting/excluding a tool by name controls availability, not which extension owns a duplicate registration.

Safest during this stage: keep bundled Nu and do not load the second Nu extension, or use standalone Nushell through Bash. If you deliberately switch to another Nu extension before removal, exclude Hashline's entire extension resource (losing its other enhancements) using Pi's resource controls, and explicitly load only the chosen extension. Pi 1.1 supports `pi --no-extensions --extension ./chosen-nu-extension.ts` for a one-off run; this disables other discovered/configured extensions too. Inspect package resource selection with `pi config` for a persistent choice. This guide does not mutate settings or recommend replacing an existing custom tool allowlist.

After the gated removal release, Hashline no longer registers `nu`, so a separately reviewed extension may coexist. Verify its registration name, configuration, permission behavior, and maintenance before adoption.

## Removal-surface audit

This inventory describes the current deprecation surface. Review it again on the removal branch; do not delete shared helpers or entire multi-tool tests just because they mention Nu.

| Surface | Locations | Future removal action |
| --- | --- | --- |
| Registration/execution | `index.ts` import and registerNuTool call; `src/nu.ts` | Remove Nu registration and Nu-only implementation after the gate. |
| Binary provisioning | `package.json` dependencies.nushell; `package-lock.json` root dependency and node_modules/nushell record | Remove dependency and regenerate the lockfile; review transitive pruning rather than hand-deleting unrelated packages. |
| Shared binary resolution | `src/binary-resolution.ts`; `src/sg.ts` | Retain resolveBundledBin/executableCommand and ast-grep resolution. |
| Prompt metadata | `prompts/nu.md`; Nu entries in `src/tool-prompt-metadata.ts`; snippet/guidelines in `src/nu.ts` | Remove Nu-only entries/reference, preserving other tools and metadata loaders. |
| Configuration | PI_NUSHELL_CONFIG and config-path resolution in `src/nu.ts`; `docs/configuration.md` | Remove Hashline-owned Nu config handling/docs; do not delete user config files. |
| Error codes | `nu-*` entries in `src/ptc-error-codes.ts` | Remove Nu-only codes; retain the registry and other tools' codes. |
| Nu-only tests | `tests/nu-*.test.ts`, `tests/null-params-nu.test.ts`, `tests/ptc-error-nu.test.ts`, `tests/typebox-nu-import.test.ts`, `tests/tool-parameter-metadata-nu.test.ts`, `tests/prompt-reference-nu.test.ts` | Retire obsolete Nu-specific coverage deliberately. |
| Shared tests | `tests/binary-resolution.test.ts`; `tests/tool-prompt-metadata.test.ts`; `tests/pi-prompt-metadata-integration.test.ts`; `tests/prompt-reference-role.test.ts`; `tests/ptc-error-{contract,codes}.test.ts`; renderer coverage; `tests/codemode-integration.test.ts`; `tests/pi-084-package-contract.test.ts`; documentation/tool-selection tests | Remove only Nu expectations/cases, retaining other tool, binary, rendering, dependency, and contract coverage. |
| Mandatory selected-host assertions | `.github/workflows/pi-compatibility.yml`; `tests/pi-host-null-pipeline.test.ts`; `tests/helpers/selected-host-codemode.mjs` | Replace/remove PI_COMPAT_REQUIRE_NU assertions explicitly in the removal release; retain required tool inventories and host failure guards. |
| User/contributor guidance | README, CHANGELOG, `docs/{configuration,structured-output,integrations,tool-metadata,pi-host-api-audit,codemode-recipes}.md`, AGENTS.md | Update current availability/removal statements without rewriting historical changelog evidence. |
| Shared guards/results/rendering | `src/{normalize-tool-params,raw-argument-guard,ptc-value,codemode-integration,tui-render-utils}.ts`, `src/rtk/ansi.ts` | Retain functionality used by other tools; do not remove shared APIs. |

No Nu references were found in `scripts/` during the initial scoped audit. This does not replace a fresh repository audit at removal time.

## Follow-up removal release checklist

The checklist is intentionally unchecked in the deprecation release. Actual removal is a separate change.

- [ ] Record at least one published deprecation release and its user-facing announcement.
- [ ] Announce the separate breaking removal release; no silent patch removal.
- [ ] Verify bounded migration snippets through the independent pinned Pi 1.1 pipeline, including failures, incomplete input, and native Bash truncation.
- [ ] Refresh the removal-surface audit against the removal branch.
- [ ] Remove the nushell dependency; regenerate/review package-lock.json and package contents.
- [ ] Remove index.ts Nu import/registration and obsolete src/nu.ts code.
- [ ] Remove Nu-only prompts, metadata, configuration handling, and obsolete tests.
- [ ] Update shared tests' Nu cases without discarding other-tool coverage.
- [ ] Preserve ast-grep binary resolution and shared error, null, rendering, and codemode helpers.
- [ ] Deliberately replace/remove PI_COMPAT_REQUIRE_NU in CI and both selected-host assertion sites; add explicit checks that core tools still register and Nu does not. Do not leave an environment flag whose checks silently skip.
- [ ] Update README/current docs and publish a breaking changelog entry with retention instructions.
- [ ] Run locked-host tests/typecheck and independent pinned-host tests/typecheck; retain npm 11/12 packaging coverage.
- [ ] Verify migration/retention guidance and packaged docs in a freshly loaded session; record evidence and the final release decision.

## Compatibility during deprecation

Locked Pi 0.84.2 development checks and the independent pinned Pi 1.1.0 lane remain complementary. PI_COMPAT_REQUIRE_NU=1 still requires Nu registration in the independent lane. Deprecation does not introduce a Nu outputSchema, a structured Nu API, or a replacement Nu framework; it supersedes the earlier conditional structured-Nu proposal.

Migration recipe tests exercise the selected host's loader, wrappers, runToolCall pipeline, and QuickJS executor using an all-Hashline-tools fixture. They do not prove CLI selection resolution, provider quality, or every AgentSession lifecycle branch. Implicit locked-host skips are not independent-host evidence.
