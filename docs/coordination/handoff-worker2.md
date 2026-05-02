# Worker2 Handoff (Codex — filters + aggregations + chrome consistency lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker2`
**Branch convention:** `agent/worker2/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker2 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — v0.5 cleanup train (updated 2026-05-02 — re-ping)

### What's already shipped from your lane

- ✅ **#351** worker2 audit findings doc
- ✅ **#355** filters panel active filter summary chip strip — went out in `v0.4.0`
- ✅ **#358** test-import lint rule + `tools/lint-test-import-boundaries.ts` (cleanup train task 1)
- ✅ **#362** optional `filter` / `onFilterChange` props (cleanup train task 2)
- 🟡 **#369** `<BcGrid searchHotkey>` prop (cleanup train task 3) — in coordinator review

v0.4.0 is **published** to GitHub Packages. v0.5 PRs land into the v0.5.0 candidate.

### Active now → `v05-fit-prop` (task 4 below)

Each task is its own branch + PR; ship in order. The full pipeline:

1. ✅ **`v05-test-import-lint`** — DONE (#358).

2. ✅ **`v05-optional-filter-prop`** — DONE (#362).

3. 🟡 **`v05-search-hotkey-prop`** — IN REVIEW (#369).

4. ✅ **`v05-fit-prop`** — DONE (#373).

5. **🟢 `v05-api-ref-filter` (ACTIVE) — `BcGridApi.openFilter` / `closeFilter`**
   Add filter-side imperative methods to the public `BcGridApi` (audit P0-7 / synthesis sprint plan). Worker3 already shipped the editor side (`startEdit`/`commitEdit`/`cancelEdit`) in #361; worker1 owns server-side `scrollToCell` separately (#366). Your half is the filter pair:
   ```ts
   apiRef.current.openFilter(columnId, { variant?: 'popup' | 'inline' })
   apiRef.current.closeFilter(columnId)
   ```
   Plus `getActiveFilter(columnId)` if natural. Document in `api.md`. **This closes the v0.5 P0-7 lane fully.** **Effort: half day including tests.** Branch: `agent/worker2/v05-api-ref-filter`.

6. **`v05-filter-discriminated-union` (STRETCH — only if 1-5 land cleanly)** — Convert `BcColumnFilter` to a discriminated union per type:
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
