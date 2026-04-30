# AG Grid Clean-Room Comparison Audit Plan

Coordinator-owned plan for side-by-side AG Grid vs bc-grid audits.

Do not clone, download, open, or inspect the AG Grid source repository for this project. Do not copy or translate AG Grid source logic. The value of this audit is behavioral parity, product judgment, and pattern validation from public surfaces, not source-derived implementation.

## Allowed Inputs

- AG Grid public documentation and public API reference.
- Public examples and screenshots.
- Publicly documented interaction patterns, configuration shapes, and UX conventions.
- Black-box behavior observed by running a consumer app or minimal demo that uses a public AG Grid package, if the maintainer approves the dependency/license for that local audit.
- bc-grid source, tests, docs, examples, and package behavior.
- User reports from `bsncraft` or other consuming apps.

## Disallowed Inputs

- Cloning `ag-grid`, `ag-grid-community`, or `ag-grid-enterprise` source repositories into `~/work` or anywhere else for inspection.
- Reading AG Grid implementation files, patches, internals, or minified/decompiled bundles to infer logic.
- Copying algorithm structure, internal names, private state machines, or implementation details.
- Treating AG Grid bugs as compatibility requirements unless the maintainer explicitly chooses bug-for-bug behavior for a consumer-critical case.

## Pattern Validation Rule

AG Grid can be used as a product reference for what serious grid users expect, especially around Enterprise-style workflows. It is acceptable to validate UX, API, and behavior patterns from public documentation, examples, screenshots, and approved black-box demos. It is not acceptable to derive bc-grid implementation details from AG Grid source or internals.

## Audit Output

Each audit should create or update a file under `docs/audits/ag-grid-comparison/` named:

```text
YYYY-MM-DD-<area>.md
```

Use this structure:

```md
# AG Grid Comparison: <Area>

## Scope
- What bc-grid feature or workflow is being compared.

## Inputs
- Public docs URLs or black-box scenarios used.
- bc-grid files/tests/examples inspected.
- Confirmation: no AG Grid source inspected.

## Where bc-grid is better
- Concrete behavior, DX, performance, accessibility, theming, or integration advantages.

## Parity
- Behaviors that match well enough for ERP workloads.

## Gaps
- Missing or weaker behavior.
- Severity: P0/P1/P2/P3.
- Suggested bc-grid-native fix, without source-derived logic.

## Bugs Found In bc-grid
- Repro steps.
- Expected behavior from public docs or black-box observation.
- Proposed owner/task.

## Non-Goals / Deferred
- Things AG Grid supports that bc-grid intentionally does not need for v1.0.
```

## Comparison Areas

Run these as independent audits. They can be assigned to workers, but the coordinator must review for clean-room compliance.

- [ ] Layout and scrolling: fixed-height grids, viewport sizing, header/body sync, pinned columns, resize affordances.
- [ ] Column operations: resize, reorder, visibility, pinning, grouped headers, tool panel behavior.
- [ ] Sorting and filtering: multi-sort, text/number/date/set filters, popup filters, filters panel, persistence.
- [ ] Selection and range: row selection, keyboard selection, range overlay, clipboard copy/paste, fill handle.
- [ ] Editing: editor lifecycle, validation, async commit, dirty/pending/error states, keyboard behavior.
- [ ] Server row model: paged/infinite/tree loading, invalidation, retry, cache behavior, live updates.
- [ ] Grouping, aggregation, pivot: group rows, footers, pivot panel, pivot output, value formatting.
- [ ] Export: CSV, XLSX, PDF, selected/range/server export semantics.
- [ ] Chrome and productivity: status bar, sidebar panels, context menu, pagination, charts.
- [ ] Accessibility: ARIA grid/treegrid semantics, keyboard model, live regions, screenreader behavior, high contrast.
- [ ] Mobile/touch: coarse pointer targets, long-press context menu, double-tap edit, touch range handles.
- [ ] Theming and DX: shadcn-native styling, CSS variables, package install, tree-shaking, docs quality.

## Coordinator Loop

1. Pick one comparison area.
2. Gather public-doc and black-box observations only.
3. Write the audit file.
4. Convert confirmed bc-grid gaps into `docs/queue.md` tasks or GitHub issues.
5. If an audit shows bc-grid is better, add it to release notes or the migration guide.
6. If the audit reveals a v1.0 blocker, map it to the next release milestone in `docs/coordination/release-milestone-roadmap.md`.

## Language Discipline

Use these phrases:

- "Match observed behavior"
- "Implement a bc-grid-native approach"
- "Public docs describe"
- "Black-box behavior shows"

Avoid these phrases:

- "Copy AG Grid logic"
- "Port AG Grid implementation"
- "Replicate internals"
- "Use AG Grid's algorithm"

The goal is to learn from product behavior while keeping bc-grid independently implemented.
