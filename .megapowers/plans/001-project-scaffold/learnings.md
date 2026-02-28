## Learnings: 001-project-scaffold

- **`npm pack` is the cleanest way to stage upstream source.** Packing published packages via `npm pack <pkg>@<version>` then extracting the tarballs gives a deterministic, reproducible snapshot of upstream source without git clones or unstable network-dependent install trees. This should be the default pattern for any scaffold task that ports upstream code.

- **Scaffold tests should test file existence, not behavior.** For a pure scaffold issue, tests that check `existsSync(path)` for each required file give fast, readable, zero-dependency coverage. Behavioral tests (imports, type checks) add fragility at this stage and belong in later integration milestones.

- **The `tsconfig.json` module/moduleResolution pair matters a lot for ESM.** Using `"module": "ESNext"` with `"moduleResolution": "bundler"` (rather than `NodeNext`/`NodeNext`) avoids the `.js` extension requirement on relative imports, which is essential when porting source files that use bare `.ts` extension imports. Mismatching these settings is a common source of confusing tsc errors.

- **Explicitly exclude forbidden files in the plan, not just the test.** AC13 required that `source.ts` and `search.ts` from the RTK package NOT be present. The plan properly handled this as a separate task (Task 10) that deleted the files after the bulk copy in Task 9. The pattern — copy-all then delete-forbidden — is simpler and safer than filtering at copy time.

- **Per-task test files pair well with per-AC verification.** Writing one test file per acceptance criterion group made it easy to run targeted checks during implementation and to verify each AC independently in the verification phase. The cost (8 test files) is low relative to the traceability gained.

- **Peer dependencies should be declared explicitly even in private packages.** Even though `@mariozechner/pi-coding-agent` and `@sinclair/typebox` are consumed transitively, declaring them as both `peerDependencies` and `devDependencies` makes version expectations explicit and prevents silent mismatches when the extension is loaded by the pi host.

- **`scripts/` and `prompts/` are first-class project artifacts, not afterthoughts.** Including the Python and Go outline scripts alongside the TypeScript source from the start means future tasks that wire them in don't need a separate "add this file" step. Same for prompt templates — keeping them in `prompts/` from day one establishes the directory convention that integration tasks will depend on.
