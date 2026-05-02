# Worker2 Handoff (Codex — filters + aggregations + chrome consistency lane)

**Last updated:** 2026-05-02 by Claude coordinator
**Worktree:** `~/work/bcg-worker2`
**Branch convention:** `agent/worker2/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker2 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

---

## Active task — v0.5 cleanup train (updated 2026-05-02)

**v0.4.0 published** (tag pushed; release workflow runs in CI). Your PR #355 (filters panel active summary) shipped. Synthesis at `docs/coordination/audit-2026-05/synthesis.md` ratified the v0.5 plan; PRs from here roll into the v0.5.0 candidate. **Pivot to v0.5 cleanup work** — small, focused PRs in the order below. Each is a separate branch + PR.

### Order of work (each one is a separate PR; ship in this order)

1. **`v05-test-import-lint`** — Replace 10 internal-path test imports in `packages/react/tests/editorChrome.test.tsx` (lines 4-12) and `checkboxEditor.markup.test.tsx:3` with `@bc-grid/editors` imports. Then add a Biome rule (or eslint rule) that fails on relative imports across `packages/*/src` boundaries from test files. **Effort: ~30 min including the rule.** Branch: `agent/worker2/v05-test-import-lint`.

2. **`v05-optional-filter-prop`** — Make `filter` and `onFilterChange` truly optional on `BcGridProps`. Today bsncraft uses `...{onFilterChange ? { filter, onFilterChange } : {}}` to work around the type (see `~/work/bsncraft/apps/web/components/data-grid.tsx:573`). Tests pin the optional path. **Effort: ~30 min.** Branch: `agent/worker2/v05-optional-filter-prop`.

3. **`v05-search-hotkey-prop`** — Add `<BcGrid searchHotkey>` prop that owns Cmd/Ctrl+F. Exposes a `searchInputRef` so consumers can wire focus. Removes the duplicate listeners in `~/work/bsncraft/apps/web/components/data-grid.tsx:179-215` and `~/work/bsncraft/packages/ui/src/components/data-table.tsx:1-25`. **Effort: 1-2 hours.** Branch: `agent/worker2/v05-search-hotkey-prop`.

4. **`v05-fit-prop`** — Add `fit="content" | "viewport" | "auto"` prop on `<BcGrid>` that owns viewport-fit height math currently duplicated in bsncraft `data-grid.tsx:296-310` (15 lines of header + filter row + body math). **Effort: 2-3 hours including tests.** Branch: `agent/worker2/v05-fit-prop`.

5. **`v05-filter-discriminated-union` (STRETCH — only if 1-4 land cleanly)** — Convert `BcColumnFilter` to a discriminated union per type:
   ```ts
   type BcColumnFilter =
     | { type: 'text'; caseSensitive?: boolean; regex?: boolean; variant?: 'popup' | 'inline' }
     | { type: 'number'; precision?: number; variant?: 'popup' | 'inline' }
     | { type: 'date'; granularity?: 'day' | 'month'; variant?: 'popup' | 'inline' }
     | { type: 'set'; options?: string[]; loadOptions?: () => Promise<string[]> };
   ```
   Public API change; coordinator runs API-surface diff at review. **Only ship if** it doesn't churn types under bsncraft mid-sprint. Branch: `agent/worker2/v05-filter-discriminated-union`.

### Cross-worker contract — Excel paste (split with worker3)

After tasks 1-4, you may pick up the **Excel paste wiring** (audit P0-1 / synthesis sprint plan). Your half:

- Add `paste` event listener on the grid root (or a hidden input that owns the active cell's focus context).
- Expose a `pasteTsv({ range, tsv })` API on `BcGridApi`.
- Call into worker3's editor commit binding (worker3 owns `editController.commitFromPasteApplyPlan`).
- Use the existing `buildRangeTsvPasteApplyPlan` helper.

**Coordinate via the `pasteTsv` API surface** — define the contract in `docs/api.md` first; worker3 implements the editor side against the same contract.

Branch (when you reach it): `agent/worker2/v05-paste-listener`.

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
