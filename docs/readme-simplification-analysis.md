# README Simplification Analysis

## Summary

The current `README.md` is accurate and comprehensive, but it is harder to understand than it needs to be because it mixes beginner, power-user, and integrator documentation in one linear flow.

A README should act as the front door to the project. For this package, that means a new reader should quickly understand:

1. what `pi-hashline-readmap` does,
2. why it is useful,
3. how to install it,
4. how to use the core anchored-read/edit workflow,
5. where to go for advanced configuration and integration details.

The existing README answers all of these, but some answers are buried under advanced reference material.

## Main issue

The README currently serves three audiences at once:

1. **New users** — want to know what this is, whether they need it, how to install it, and how to try it.
2. **Power users** — want configuration, Bash guard behavior, optional tools, and workflow details.
3. **Integrators / developers** — want `details.ptcValue`, EventBus integration, context hygiene metadata, and tool policy contracts.

All three audiences are valid, but they should not all be forced through the same long document path.

## Recommended restructure

A clearer top-level README shape would be:

```md
# pi-hashline-readmap

One paragraph: what it does and why it matters.

## Why use it?

Short practical bullets.

## Install

npm / git / local workspace.

## 30-second example

read → edit using a `LINE:HASH` anchor.

## Common workflows

- Safe anchored edits
- Large-file navigation
- Search-to-edit
- Bash output normalization and recovery
- Optional Nushell exploration

## Configuration

Short intro plus the env-var table.

## Advanced integrations

Short links to structured output, PTC policy, context hygiene, and EventBus docs.

## Development

Tests, typecheck, project structure, contributing.
```

## Specific recommendations

### 1. Condense Quick Start and Installation

The README currently has both:

- `## Quick Start`
- `## Installation`

They repeat the same install commands. These could be merged into one clearer install section:

```md
## Install

### From npm
pi install npm:pi-hashline-readmap

### From GitHub
pi install git:github.com/coctostan/pi-hashline-readmap

### From a local checkout
...
```

This reduces repeated cognitive load near the top of the file.

### 2. Add a “30-second example” near the top

The core value is anchored tool output that can be safely reused. Show that immediately:

```md
## 30-second example

read({ path: "src/example.ts" })
# 12:abc|const oldName = 1;

edit({
  path: "src/example.ts",
  edits: [
    { set_line: { anchor: "12:abc", new_text: "const newName = 1;" } }
  ]
})
```

This communicates the product better than a long feature list.

### 3. Rename “Usage” to “Common workflows”

The current `Usage` section is a list of tool examples. It would be easier to scan if grouped by job-to-be-done:

- **Safely edit a line** — `read` → `edit`
- **Navigate a large file** — `read({ map: true })`, `read({ symbol })`
- **Search and patch** — `grep` → `edit`
- **Search code structurally** — `ast_search`
- **Explore files** — `ls`, `find`, `nu`
- **Handle noisy command output** — Bash normalization and guard recovery

This makes the README more user-centered.

### 4. Move advanced integration details to separate docs

The following sections are useful but advanced:

- `Structured output (details.ptcValue)`
- `Context hygiene metadata and stale context`
- `EventBus integration`

They should likely move to dedicated docs, for example:

- `docs/structured-output.md`
- `docs/context-hygiene.md`
- `docs/integrations.md`

The README can keep a short `Advanced integrations` section with links and one-sentence summaries.

### 5. Make configuration more task-oriented

Before the env-var table, add a short guide:

```md
Most users do not need configuration.

Use configuration when you want to:

- tighten visible grep output budgets,
- change where structural map caches are stored,
- disable persistent map caching,
- tighten or disable the Bash context guard,
- enable context-hygiene debugging.
```

Then keep the table. This helps readers understand why the knobs exist before parsing the details.

### 6. Keep Bash guard docs, but shorten the first-read path

The Bash context guard documentation is important because oversized output is replaced by a recoverable preview. Keep that behavior in README, but place detailed recovery semantics under configuration or a linked Bash docs page.

Suggested split:

- README: short explanation and env-var table.
- `docs/bash-output.md`: full normalization pipeline, recovery paths, guard metadata, and examples.

## What should stay in README

The README should keep:

- the project purpose,
- install commands,
- the core anchored edit example,
- the most common tool workflows,
- configuration summary,
- development commands,
- links to advanced docs.

## What can move out

The README can move or shorten:

- full `ptcValue` interface details,
- full context hygiene semantics,
- full EventBus executor surface,
- detailed policy contract explanation.

Those are reference materials, not first-read materials.

## Proposed follow-up issue

Create a documentation issue with this scope:

> Reorganize `README.md` around install, 30-second example, common workflows, and configuration. Move advanced integration/reference content into focused docs under `docs/`, keeping README links to each advanced topic.

Acceptance criteria:

1. README has a concise install path and no duplicate Quick Start / Installation commands.
2. README includes a short read/edit anchor example near the top.
3. Tool examples are grouped by common workflows rather than raw tool order.
4. Advanced `ptcValue`, context hygiene, and EventBus details are moved to docs or substantially shortened with links.
5. Configuration remains complete, including all Bash context-guard variables.
6. README remains accurate against `package.json`, source behavior, and current tests.
