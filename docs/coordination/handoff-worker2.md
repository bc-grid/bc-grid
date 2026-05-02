# Worker2 Handoff (Codex — filters + aggregations + chrome consistency lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker2`
**Branch convention:** `agent/worker2/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker2 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

## Hard rule — workers do NOT run Playwright / e2e / smoke-perf / perf / broad benchmarks

This is binding (`docs/AGENTS.md §6`). Workers run focused unit tests + `bun run type-check` + `bun run lint` + the affected package's build. **Never** run `bun run test:e2e`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark commands. The coordinator runs those during review/merge. If your change adds or modifies a `.pw.ts` file, note in the PR that it was not run locally — the coordinator will run it.

You implement code; the coordinator reviews and runs the slow gates.

**Note on CI:** GitHub Actions automatically runs `smoke`, `e2e (Playwright)`, and `smoke perf (Chromium)` jobs on every PR. **Those CI jobs are not "you running tests"** — they are the coordinator's CI infrastructure verifying your work. Seeing `e2e (Playwright) ✓` in the PR's checks panel is expected and good. Don't disable them, don't try to mirror them locally. Your PR description should say something like "Per worker handoff, I did not run local Playwright/e2e or smoke-perf; coordinator CI owns those gates" so reviewers know the local gates you ran (type-check, lint, focused unit tests) and understand the CI Playwright result is the coordinator's verification, not yours. **The PR you wrote in #380 already followed this exactly — keep doing that.**

---

## Active task — v0.5 stretch + v0.6 prep (LAST v0.5 P0 just shipped — paste integration done in #380)

### What's already shipped from your lane

- ✅ **#351** worker2 audit findings doc
- ✅ **#355** filters panel active filter summary chip strip — went out in `v0.4.0`
- ✅ **#358** test-import lint rule (cleanup train task 1)
- ✅ **#362** optional `filter` / `onFilterChange` props (cleanup train task 2)
- ✅ **#369** `<BcGrid searchHotkey>` prop (cleanup train task 3)
- ✅ **#373** `<BcGrid fit>` prop (cleanup train task 4)
- ✅ **#377** `BcGridApi.openFilter` / `closeFilter` / `getActiveFilter` (audit P0-7 filter side — closes the apiRef trio fully)
- ✅ **#380** `BcGridApi.pasteTsv` + native paste-event listener + bulk edit overlay commit path (audit **P0-1 fully closed** — you also subsumed the editor-side binding worker3 was originally going to write)

v0.4.0 is **published** to GitHub Packages. v0.5 PRs land into the v0.5.0 candidate. **All v0.5 P0 items are now closed** — your lane is done. Pivot to stretch + v0.6 prep.

### Active now → `v05-filter-discriminated-union` (stretch)

P0-1 paste integration shipped in #380, including the editor-side binding through `useEditingController` that was originally split with worker3. Net result: v0.5 P0-1 fully closed. Your lane has no remaining v0.5 P0 work.

Pick up the stretch task that was queued. Convert `BcColumnFilter` to a discriminated union per type:
   ```ts
   type BcColumnFilter =
     | { type: 'text'; caseSensitive?: boolean; regex?: boolean; variant?: 'popup' | 'inline' }
     | { type: 'number'; precision?: number; variant?: 'popup' | 'inline' }
     | { type: 'date'; granularity?: 'day' | 'month'; variant?: 'popup' | 'inline' }
     | { type: 'set'; options?: string[]; loadOptions?: () => Promise<string[]> };
   ```
   Public API change; coordinator runs API-surface diff at review. **Only ship if** it doesn't churn types under bsncraft mid-sprint. Branch: `agent/worker2/v05-filter-discriminated-union`.

### Cross-worker contract — Excel paste (split with worker3)

After your cleanup train, **pick up the Excel paste wiring** (audit P0-1 / synthesis sprint plan). This is the last unfinished v0.5 P0. worker3 has alternatives unblocked of paste (autocomplete Combobox, sales-estimating sans-paste, cheap P1s) so paste is not their critical path, but the integration is still a v0.5 release-gate item. Your half:

- Add `paste` event listener on the grid root (or a hidden input that owns the active cell's focus context).
- Expose a `pasteTsv({ range, tsv })` API on `BcGridApi`.
- Call into worker3's editor commit binding (worker3 owns `editController.commitFromPasteApplyPlan`).
- Use the existing `buildRangeTsvPasteApplyPlan` helper.

**Coordinate via the `pasteTsv` API surface** — define the contract in `docs/api.md` first (open a small RFC-style PR with just the API shape if it helps), then implement; worker3 implements the editor side against the same contract.

Branch (when you reach it): `agent/worker2/v05-paste-listener`.

### After v0.5 cleanup + paste

- **Stretch:** filter discriminated union (`v05-filter-discriminated-union` task 6 above).
- **v0.6 prep:** worker2 lane owns several v0.6 items per the audit synthesis: group-before-paginate + group subtotals (audit P0-8 — the biggest worker2 piece for v0.6), group selection algebra (P1-W2-5), filter registry implementation (P1-W2-1). Don't start v0.6 work until v0.5 ships, but it's queued for after.

### Rules reminder

- Don't run Playwright / smoke-perf / perf / broad benchmarks.
- Don't bump bundle baseline (coordinator owns it; baseline was just bumped to 71500 B for `@bc-grid/react` — you have headroom).
- Open PR; do not merge your own.
- Update `docs/queue.md` `[draft]` → `[in-flight: worker2]` → `[review: worker2 #PR]` at state transitions.

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
