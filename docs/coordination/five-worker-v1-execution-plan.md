# Five-Worker v1.0 Execution Plan

**Owner:** Codex coordinator in `~/work/bc-grid`  
**Date:** 2026-04-30  
**Workers:** worker1 Codex, worker2 Claude, worker3 Codex, worker4 Claude, worker5 Codex  
**Source of truth:** `docs/queue.md` for claim state; this document for assignment strategy.

---

## Operating Model

The five workers are implementers. They claim one task at a time, code, run focused local validation, open a PR, and move back to their parking branch after merge. The Codex coordinator reviews PRs, resolves merge-train issues, merges, cuts releases, updates the queue if needed, and runs Playwright / smoke-perf / benchmark validation.

Workers must not run Playwright, smoke-perf, or broad benchmark commands. Do not run `bun run test:e2e`, `bun run test:e2e:full`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark runs from worker worktrees. Workers may add or update `.pw.ts` specs when the task needs browser coverage, but they must leave execution to the coordinator and say so in the PR.

If a design doc or RFC says "E2E (Playwright)" under acceptance, that describes required coverage, not a worker-run command. The coordinator runs those specs.

Each worker starts from:

```bash
cd ~/work/bcg-workerN
git checkout workerN
git fetch origin
git reset --hard origin/main
bun install
```

Then the worker reads `CLAUDE.md`, `docs/queue.md`, this plan, and the relevant RFC/design doc before claiming.

---

## Current State

`filter-popup-variant` is already open as PR #145 and marked `[review: c1 #145]`. It is coordinator-owned, not assigned to a worker. The coordinator should rebase/merge it before `worker2` starts filter-set work, because filter-set should build on the shared popup filter body from that PR.

There are no `[in-flight: ...]` queue entries. All five workers are available.

---

## Wave 0: Coordinator Before Workers Start

1. Review PR #145 (`filter-popup-variant`).
2. Rebase or update it onto current `main` if needed.
3. Run the targeted popup-filter Playwright spec and smoke checks.
4. Merge it if clean.
5. Cut a release if the demo-critical release cadence requires it.
6. Reset all worker parking branches to the new `origin/main`.

This removes the main conflict risk for `worker2`.

---

## Wave 1: First Parallel Claims

| Worker | Model | First task | Claim branch | Primary files | Acceptance |
|---|---|---|---|---|---|
| worker1 | Codex | `range-state-machine` | `agent/worker1/range-state-machine` | `packages/core`, maybe `packages/react/src/keyboard.ts` only if required | Range state supports anchor, extend, multi-range, stable serialization, unit tests. |
| worker2 | Claude | `filter-set-impl` | `agent/worker2/filter-set-impl` | Filter UI code in `packages/react/src/headerCells.tsx` plus focused helpers/tests | Distinct-value multi-select filter, lazy compute on first open, operators `in` / `not-in` / `blank`, works in popup and inline variants. |
| worker3 | Codex | `group-by-client` | `agent/worker3/group-by-client` | `packages/react/src/gridInternals.ts`, `bodyCells.tsx`, grouping helpers/tests | One or more group-by columns, expand/collapse, count labels, treegrid semantics, no range/filter coupling. |
| worker4 | Claude | `editor-framework` | `agent/worker4/editor-framework` | `packages/react/src/useEditingController.ts`, `editingStateMachine.ts`, `editorPortal.tsx` | Remaining editor framework contract matches `editing-rfc`, assertive live region support, text/number unlock is clear. |
| worker5 | Codex | `sidebar-impl` | `agent/worker5/sidebar-impl` | New chrome/sidebar module plus `packages/react/src/grid.tsx` integration | Right-edge icon rail, tablist semantics, Esc close/focus return, slots ready for column/filter/pivot panels. |

These are intentionally disjoint. `worker2`, `worker3`, and `worker5` may each touch React grid composition, so they should keep edits narrow and avoid opportunistic refactors.

---

## Wave 2: Unlocks

| When merged | Next work |
|---|---|
| `range-state-machine` | `visual-selection-layer` and `clipboard-copy-tsv-html` can run in parallel. Clipboard should wait for stable range serialization if range state changes late. |
| `filter-set-impl` | `filter-multi-impl`, `filter-persistence`, and filter popup polish. Prefer `filter-multi-impl` first for bsncraft columns that already store arrays. |
| `group-by-client` | `tool-panel-columns` group-by drop zone after `sidebar-impl`; `pivot-row-col-groups` can reuse group row rendering patterns. |
| `editor-framework` | `editor-text`, `editor-number`, then `bc-edit-grid-complete` once post-commit integration is clear. |
| `sidebar-impl` | `tool-panel-columns`, `tool-panel-filters`, and `pivot-ui-drag-zones`. Run these as separate PRs. |

---

## Wave 3: v1 Breadth

After demo-critical features are in review, fill remaining v1 parity in this order:

1. Chrome completion: `status-bar-impl`, `context-menu-impl`, `tool-panel-columns`, `tool-panel-filters`, `footer-aggregations`.
2. Range completion: `visual-selection-layer`, `clipboard-copy-tsv-html`, `clipboard-paste-from-excel`, `fill-handle`.
3. Pivot completion: `pivot-ui-drag-zones`, `pivot-row-col-groups`.
4. Filter completion: `filter-multi-impl`, `filter-date-range-impl`, `filter-number-range-impl`, `filter-text-impl-extend`, `filter-persistence`.
5. Editing completion: `editor-text`, `editor-number`, `bc-edit-grid-complete`, `editor-custom-recipe`.
6. Polish: `streaming-row-updates`, `mobile-touch-fallback`, `animation-polish`, `migration-guide`, `wcag-deep-pass`, `browser-compat-matrix`.

The coordinator should keep at least one worker on demo-critical flow until range copy, set filter, and group-by are merged and released.

---

## Conflict Boundaries

- `packages/react/src/grid.tsx`: coordinator watches closely. Workers should add narrow integration points and push reusable logic into small helpers/modules.
- `packages/react/src/headerCells.tsx`: filter work only. Chrome/sidebar workers should not edit this file unless their task explicitly requires it.
- `packages/react/src/bodyCells.tsx`: group/range visual work may touch it; sequence those PRs if conflicts grow.
- `packages/core/src/index.ts`: public API additions must update `docs/api.md` and `tools/api-surface/src/manifest.ts` in the same PR.
- `apps/examples/src/App.tsx`: examples are useful but conflict-prone. Workers should add the smallest demo hook needed; coordinator can do final demo stitching.

---

## Worker PR Contract

Every PR should include:

- Task slug and queue link.
- Files intentionally owned by the PR.
- What is done, what is deferred, and what task it unlocks.
- Local validation output: usually `bun run type-check`, `bun run lint`, `bun run test`, and package-specific tests. Add `bun run build` when public exports or package wiring changed.
- Playwright note: "not run locally; coordinator owns all Playwright / smoke-perf validation." This applies even if the worker added or updated a `.pw.ts` spec.

Before opening a PR, update `docs/queue.md` from `[in-flight: workerN]` to `[review: workerN #PR]` in the same branch.

---

## Coordinator Loop

Repeat while workers are active:

1. Watch PR list and CI.
2. Review smallest/oldest green PR first, demo-critical PRs first on ties.
3. Fix trivial merge conflicts in coordinator-owned branches only; ask worker to rebase for non-trivial conflicts.
4. Run focused Playwright for UI-sensitive PRs, then broader e2e batches after merge groups.
5. Merge, update queue to `[done: workerN #PR]`, push `main`.
6. Reset idle worker parking branches to latest `origin/main`.
7. Cut releases after demo-critical merges as required by the bsncraft integration.

The coordinator should avoid assigning two workers to tasks that both primarily edit `grid.tsx` or `headerCells.tsx` unless one is already in review.
