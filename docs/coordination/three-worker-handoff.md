# Three-Worker Handoff - v0.4 / v0.5 audit-refactor / v0.6

**Date:** 2026-05-02 (updated for audit-refactor pivot)
**Coordinator:** Claude in `~/work/bc-grid`
**Consumer validation repo:** `~/work/bsncraft`
**Active workers:** worker1 Claude, worker2 Codex, worker3 Claude

This handoff replaces the previous 5-worker sprint. The goal is to reduce Codex usage while keeping bc-grid moving toward `v0.4.0` editing/server-edit quality, `v0.5.0` audit-driven ergonomics refactor, and `v0.6.0` range/clipboard work (range/clipboard renumbered from v0.5 after the 2026-05-02 audit-refactor pivot — see `docs/coordination/v0.5-audit-refactor-plan.md`).

## Directory Contract

Only these directories should remain under `~/work` for the active setup:

- `bc-grid` - coordinator worktree, docs, PR review, merge train, release gates
- `bsncraft` - actual ERP implementation consuming bc-grid
- `bcg-worker1` - Claude worker1
- `bcg-worker2` - Codex worker2
- `bcg-worker3` - Claude worker3

Retired worker folders and old release worktrees were intentionally removed during the reset.

## Current Main Baseline

As of the reset, `main` includes:

- v0.4 chrome/pinned/filter/loading polish from PR #349
- server row model contract hardening from PR #343
- grouping examples and bsncraft grouping recipe from PR #348
- lookup editor examples/docs from PR #346

The prior open PRs were stale against this baseline. Prefer fresh branches over mechanical rebases when conflicts are non-trivial.

## Stale PR Archive

These PRs were open at reset time and should be treated as source material, not active merge candidates:

| PR | Old owner | Useful idea to salvage | New lane |
|---|---|---|---|
| #323 `server-grid-sort-flicker-fix-v040` | worker1 | Server-backed rows should stay in accepted server order while sort/filter/search refresh is loading; disable row FLIP for server refreshes if needed. | worker1 |
| #332 `v040-alpha-server-edit-grid-contracts` | worker3 | React/server edit contract tests for visible columns, stale responses, page reset, optimistic edits through refetch. | worker1 |
| #316 `server-grid-error-retry-ui-v040` | worker3 | Server load error/retry surface, if it fits the coordinator's loading overlay polish. | worker1 |
| #318 `filters-panel-active-summary-v040` | worker2 | Filter panel active summaries/chips; do not carry its old bundle baseline bump. | worker2 |
| #320 `filter-popup-keyboard-contract-v040` | worker2 | Pure helper for filter popup keydown isolation and focused tests. | worker2 |
| #350 `editor-contract-consolidated-v040` | worker4 | Editor keyboard/a11y contract, `useLayoutEffect` focus handoff, click-outside helper, state-machine retry tests. | worker3 |
| #315 `editor-validation-surface-v040` | worker5 | Portal-level validation message, built-in editor descriptions, pending/error visual contract. | worker3 |

## Worker Lanes

### worker1 - Claude - Server Grid Stability

Primary outcome for v0.4:

- server-backed grids do not flicker or client-sort stale rows while a server query is loading;
- server edit tests pin page-window semantics, stale response handling, pending optimistic mutations, rollback, and visible-column query payloads;
- error/retry states are restrained and consistent with the new loading overlay.

Start from fresh branches. Recommended first branch:

```bash
agent/worker1/server-grid-stability-v040
```

### worker2 - Codex - Filters and v0.6 Prep

Primary outcome for v0.4:

- filter popup/panel behavior is keyboard-safe and visually clean;
- filters panel active state is readable without looking like a hacked sidebar;
- no bundle baseline bumps or broad UI rewrites.

Secondary outcome after v0.4 blockers:

- internal range/clipboard helper work for v0.6 only; no browser clipboard UI without coordinator approval.

Recommended first branch:

```bash
agent/worker2/filter-panel-popup-polish-v040
```

### worker3 - Claude - Editor Validation and Lookup UX

Primary outcome for v0.4:

- editor keyboard contract is pinned: F2, printable seed, Enter, Shift+Enter, Tab, Shift+Tab, Escape, click-outside;
- built-in editors expose clean pending/error/disabled/focus treatment;
- validation messages are visible and accessible;
- lookup/select/autocomplete typed values and async option behavior are documented and tested.

Recommended first branch:

```bash
agent/worker3/editor-validation-contract-v040
```

## Coordinator Duties

The Claude coordinator in `~/work/bc-grid` should:

1. Keep `docs/queue.md` claim state accurate.
2. Keep workers on disjoint write scopes.
3. Review PRs for behavior, API, tests, and UI quality.
4. Run Playwright, smoke-perf, broad benchmarks, release-preflight, and package publishing.
5. Validate released package candidates in `~/work/bsncraft` or write exact handoff notes for the bsncraft agent.
6. Recommend version bumps only when `docs/coordination/release-milestone-roadmap.md` gates are satisfied.

## Hard Rules

- No AG Grid source inspection or code copying.
- Use public AG Grid docs/examples/behavior only for pattern validation.
- Shadcn/Tailwind v4 visual quality is not optional; poor chrome is a blocker.
- Workers do not run Playwright/smoke-perf/perf.
- Do not add charts to v1.0 scope; charts remain post-1.0.
- Avoid broad refactors while the release train is moving.

## Release Focus

`v0.4.0` should ship when editing, validation, and server-backed edit contracts are credible enough for `bsncraft` to wire a realistic editable customers grid.

`v0.5.0` is the **audit-driven ergonomics refactor** — turnkey state hooks (`useBcGridState`, `useServerPagedGrid`), expanded `apiRef` (focus/scroll/edit/filter), and four hero-use-case spike grids in `apps/examples/`. Detailed scope in `docs/coordination/v0.5-audit-refactor-plan.md`.

`v0.6.0` (formerly `v0.5.0`) focuses on spreadsheet workflows: range state, copy TSV/HTML, paste planning/apply helpers, validation rollback, and fill handle.
