# Spec — 007-readme-license-e2e

## Acceptance Criteria

### AC-1: README.md exists with required sections
- `README.md` exists at project root
- Contains a project title/heading referencing "pi-hashline-readmap"
- Contains an "Installation" section with `pi install` instructions
- Contains a "What You Get" or "Features" section describing read, edit, grep tools
- Contains output format examples showing `LINE:HASH|` pattern
- Contains a "Development" section with test/build commands
- Contains a "Credits" or "Upstream" section naming all three upstream projects:
  - hashline-edit (RimuruW)
  - read-map (Whamp)
  - rtk (mcowger)
- Contains a "License" section referencing MIT

### AC-2: README documents structural map behavior
- README mentions that large/truncated files get a structural map appended
- README mentions the 17 supported languages
- README shows an example of map output (illustrative, not exact)

### AC-3: LICENSE file exists with MIT text
- `LICENSE` file exists at project root
- Contains "MIT License" text
- Contains a copyright line with year 2026

### AC-4: Automated tests verify README and LICENSE
- Test file `tests/readme-license.test.ts` exists
- Tests verify README.md exists
- Tests verify README.md contains key content markers: project name, "Installation", "Credits", "LINE:HASH"
- Tests verify LICENSE exists
- Tests verify LICENSE contains "MIT"
- Tests follow the existing `*-files.test.ts` pattern (fs.existsSync + readFileSync + string checks)

### AC-5: Manual E2E checklist documented
- The following 6 checks are documented (in this spec — not necessarily in a shipped file):
  1. `pi install .` — extension loads without errors
  2. Read small file → output has `LINE:HASH|` prefixes, no map
  3. Read large file (>2000 lines) → output has hashlines + structural map appended
  4. Edit using hash anchors from read output → edit applies correctly
  5. Grep → results have `LINE:HASH|` anchors
  6. `/reload` → extension reloads cleanly

### AC-6: All existing tests continue to pass
- `npm test` passes with zero failures (no regressions)
- New test file integrates cleanly with existing vitest setup

## Out of Scope
- Automated E2E tests (require running pi instance)
- npm publish workflow
- CHANGELOG updates (separate concern)
- Badge/CI integration in README
