# Brainstorm — 007-readme-license-e2e

## Approach

This issue closes out M1 with three deliverables: a **README.md**, an **MIT LICENSE file**, and a **manual E2E verification checklist**. No new runtime code is needed — this is purely documentation and polish.

The README will be the project's front door. It explains what the extension does (combines hashline-edit + read-map into a single conflict-free package), how to install it (`pi install .` or `pi install npm:pi-hashline-readmap`), and what output looks like (small file → hashlines only, large file → hashlines + structural map). It credits the three upstream projects (hashline-edit by RimuruW, read-map by Whamp, rtk by mcowger) since this project is a combination of their work.

The E2E verification is a manual checklist — 6 smoke tests run once against a live pi instance to confirm everything works end-to-end. These aren't automatable without deep pi mocking, and the existing unit/integration tests already cover the logic paths.

## Key Decisions

- **Manual E2E, not automated** — the checks require a running pi instance; unit tests already cover logic
- **README structure follows the issue spec** — what/why/install/examples/dev/credits/license
- **Output examples in README are illustrative, not exact** — showing the format pattern, not literal test output
- **LICENSE is MIT** — matches all three upstream projects
- **Tests are file-existence checks only** — verify README.md and LICENSE exist with expected content markers (title, MIT text, upstream credits). No prose validation.

## Components

1. **README.md** — project documentation (~150-200 lines)
   - What it is (combined hashline-edit + read-map + rtk bash techniques)
   - Why it exists (resolves read tool conflict)
   - What you get (read, edit, grep + structural maps + bash compression)
   - Installation: `pi install .` / `pi install npm:pi-hashline-readmap`
   - Output format examples for small and large files
   - Development setup
   - Upstream credits (hashline-edit by RimuruW, read-map by Whamp, rtk by mcowger)
   - License (MIT)
2. **LICENSE** — standard MIT license text
3. **E2E checklist** — 6 manual verification steps (documented in brainstorm/spec, run by hand)
4. **Tests** — `readme-license.test.ts` checking file existence and key content markers

## Testing Strategy

- **Automated (vitest):** File existence tests — README.md exists and contains key sections (Installation, Usage, Credits); LICENSE exists and contains "MIT". Simple `fs.existsSync` + content string checks, consistent with the project's existing `*-files.test.ts` pattern.
- **Manual:** 6-point E2E checklist run once before shipping:
  1. `pi install .` — extension loads without errors
  2. Read small file → hashlines, no map
  3. Read large file → hashlines + structural map
  4. Edit using anchors → applies correctly
  5. Grep → results have hash anchors
  6. `/reload` works cleanly
