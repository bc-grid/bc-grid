# Worker2 Handoff (Codex — filters + aggregations + chrome consistency lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker2`
**Branch convention:** `agent/worker2/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker2 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — v0.4 lane work (updated 2026-05-02)

Your audit findings PR (**#351**) merged. The v0.4 train is in flight; pivot back to your original v0.4 lane scope per `docs/coordination/v0.4-alpha-plan.md` Worker2 lane.

### v0.4 focus

- Polish filter popup keyboard contracts (e.g., focus management on open/close, keyboard isolation when popup is open over active cell).
- Filters panel active summary surface — your audit P2 already aligned this with v0.4 chrome work; consider implementing the small chip-style summary in the filters panel toolbar (your audit said: "Add a small active-filter summary surface that can live in a toolbar/status region and reuse `clearFilter(columnId)`").
- Stay on shadcn/Tailwind v4 chrome contract; do **not** regress visual quality (`docs/coordination/ui-quality-gate.md` is binding).
- **No bundle baseline bumps** — coordinator owns bundle policy.

**Branch suggestion:** `agent/worker2/v04-filter-popup-contract` or `agent/worker2/v04-active-filter-summary` (pick one to start).

### Coordinator answer to your audit open-question #1

> "Should v0.5 paste integration be owned by worker2 as a range/clipboard continuation, or split with worker3 because commit/validation flows through the editor controller?"

**Split.** Worker2 owns the paste listener wiring + `pasteTsv` API surface (your range/clipboard helpers); worker3 owns the route-through-editorController binding (their editor commit lane). This will be ratified in the synthesis doc. **You don't need to start v0.5 paste work yet** — finish v0.4 lane work first.

### After v0.4 ships

This handoff will be updated with your v0.5 audit-cleanup tasks (test-import lint rule, `<BcGrid searchHotkey>` prop, `fit` prop, optional `filter` prop, stretch filter discriminated union per `docs/coordination/v0.5-audit-refactor-plan.md`).

---

## Standing lane scope

Filters, aggregations, range/clipboard prep, and chrome consistency across panels/popups. Specifically:

- `packages/filters/`
- `packages/aggregations/`
- Range/clipboard helpers in `@bc-grid/react` (v0.5 prep, internal helpers only)
- Cross-package chrome consistency (filter popups, sidebar/tool panels, inline filter row, grouping affordances)

You do **NOT** own: server row model, editors, virtualizer internals. Don't refactor adjacent code.

## Worker rules (recap — full rules in `docs/AGENTS.md`)

- Branch off `main`. Never commit to `main`.
- Branch name: `agent/worker2/<task-slug>`.
- Run `bun run type-check`, `bun run lint`, focused unit tests.
- Do **NOT** run Playwright, smoke-perf, perf, or broad benchmarks. Coordinator owns those.
- Open PR against `main`. Do not merge your own PR.
- Update `docs/queue.md` at state transitions.
- No bundle baseline bumps without coordinator approval.

## Recent activity baseline

- v0.3.0 shipped (88398c6).
- Recent chrome polish on main: filter popup chrome (#305), sidebar rail/panel polish (#309), inline filter row (#308), header resize/menu states (#310), pinned column opaque surfaces (#307), filters tool panel (#303).
- v0.4 chrome polish from #349 is the current visible UI baseline.

## When you finish the active task

1. Push the findings doc as a PR (single doc, no source changes).
2. Comment on the PR tagging the coordinator.
3. Wait for the next handoff update before starting new work.
