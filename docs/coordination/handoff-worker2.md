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
- ✅ **#384** `BcColumnFilter` discriminated union (per-type narrowing for text/number/number-range/date/date-range/set/boolean/custom)
- ✅ **#393** v0.5 chrome+filter bundle-1 (active filter chip strip in toolbar + group selection algebra basic + filter operators blank/not-blank for every scalar type)

v0.5.0-alpha.1 is **published** to GitHub Packages and bsncraft is consuming it. v0.5 PRs continue into the v0.5.0-alpha.2 candidate.

### Active now → `v05-context-menu-chrome-bundle-1` (your context-menu implementation lane, half 1 of 2, ~30-40 min)

**Bundle-1 (#393) is shipped** (active filter chip strip + group selection algebra basic + blank/not-blank operators). The next active task is the context-menu chrome toggles. The maintainer's vision is "vanilla grid by default + everything toggleable from right-click + consumer-supplied persistence API"; the RFC at `docs/design/vanilla-and-context-menu-rfc.md` (#392) ratified the architecture (note the 10 open questions in §9 — until those resolve, use placeholder field names + TODO comments for the persistence shape; coordinator will sweep through and update on RFC ratification).

**Items in this PR — toggle category "View" + "Filter" (~30-40 min):**

1. **Filter row toggle** — context-menu item View → "Show filter row" (checkbox affordance). Wires through to `BcGridProps.filterRow` (today: defaults `true`, becomes default `false` in vanilla mode per RFC §3).
2. **Sidebar toggle** — context-menu item View → "Show sidebar" + a submenu when shown: which panel is open (Columns / Filters / Pivot).
3. **Status bar toggle** — context-menu item View → "Show status bar" (checkbox).
4. **Filters panel toggle** — context-menu item Filter → "Open Filters panel" (action; routes to sidebar with filters panel selected).

Each toggle reads + writes via the new `BcUserSettings` shape (RFC will pin the exact field names). Until RFC ratifies, use placeholder field names + flag the spots in TODO comments for coordinator to update on RFC ratification.

**Branch:** `agent/worker2/v05-context-menu-chrome-bundle-1`. **Effort:** ~30-40 min.

### After bundle-1 ships → `v05-context-menu-chrome-bundle-2` (half 2 of 2, ~30-40 min)

5. **Density toggle** — context-menu item View → Density → Compact / Normal / Comfortable (radio group). Wires to the existing `data-density` attribute that the theming layer already styles for.
6. **Group-by menu** — context-menu item Group → "Group by this column" (only on header context — needs column id from event target). Toggle current column in/out of `groupBy[]`.
7. **Pin column menu** — context-menu item Pin → "Pin left" / "Pin right" / "Unpin" (on header context).
8. **Active filter chip strip toggle** — bundle-1 (#393) shipped the chip strip; now add a View → "Show active filters" toggle so users can hide it.

**Branch:** `agent/worker2/v05-context-menu-chrome-bundle-2`. **Effort:** ~30-40 min.

### Previously active → `v05-chrome-and-filter-bundle-1` (DONE — #393)

The 3 chrome/filter polish items from your own #388 doc landed (active filter chip strip in toolbar, group selection algebra basic, filter operators blank/not-blank for every scalar type).

**Items:**

1. **Active filter chip strip in toolbar** (audit P2 from #351) — today the active-filter summary lives only inside the Filters panel. Add a small always-visible chip strip suitable for status bars / toolbars; reuse `clearFilter(columnId)`. Each chip shows column header + condensed value + dismiss `×`. Goes into the existing `<BcStatusBar>` slot (or a new `BcGridProps.activeFilterSummary?: "status-bar" | "off"` toggle).

2. **Group selection algebra (basic)** (audit P1-W2-5 from #351 + #388 §2) — selecting a group row should select its visible descendants. Today click on a group row toggles expand only. Add a checkbox or modifier-click that selects the descendants. Scope: visible descendants (loaded rows on the current page). Full server-view group selection stays in v0.6.

3. **Filter operators: `blank` / `not blank`** (audit P1-W2-4 partial from #351 + #388 §6) — add `blank` and `not blank` to the operator list for `text`, `number`, `date`, `set`. The predicate side is trivial (`value == null || value === ""`); the editor side rendered as a no-input variant (just a 2-button toggle group). Don't bundle all the relative-date / fiscal-period operators here — those need the filter registry, which is v0.6.

**Branch:** `agent/worker2/v05-chrome-and-filter-bundle-1`. **Effort:** ~30-40 min for the bundle.

### Previously active → `v05-grouping-followups-planning-doc` (DONE)

Mirror worker1's #383 pattern: convert your audit findings (#351) — specifically the grouping + filter items — into concrete v0.6 task entries. Output: read-only doc at `docs/coordination/v05-audit-followups/worker2-grouping-and-filters.md`. No source changes. Pure planning pass while your lane is otherwise clean.

**Items to cover** (each as a v0.6 task proposal with file:line citations + fix shape + affected packages):

1. **Group-before-paginate + group subtotals** (audit P0-8, two-spike-confirmed in #367 + #374). The biggest worker2 v0.6 piece. Today `leafRowEntries` paginates BEFORE `buildGroupedRowModel`, so client grouping operates on a single page slice. Group rows render label + count only; `aggregateGroups` exists but isn't wired into group-row rendering. Decide the contract: client grids group BEFORE pagination (the right answer per synthesis), then wire group aggregation into group-row cells.

2. **Group selection algebra** (audit P1-W2-5). Selecting a group row should select its visible descendants (with extension paths for full server-view group selection in tree mode).

3. **Filter registry implementation** (audit P1-W2-1). `@bc-grid/filters` is currently empty; React exposes the contract but no registry exists. Implement registration → predicate dispatch → editor lookup. Closes the "custom filter" extensibility advertised in `api.md`.

4. **Set filter virtualization + async** (audit P1-W2-2). Today the set-filter menu eagerly scans all data and renders every option. Add an option-provider contract with counts, async search, virtualized list, and a "selected outside current search" preserved section.

5. **Saved-view DTO + recipe** (audit P1-W2-3). Bc-grid publishes the canonical `BcSavedView` DTO; consumers own the actual UX (per the synthesis answer to your audit open-question).

6. **ERP filter operator coverage** (audit P1-W2-4). Add: `blank` / `not blank` for every scalar type, `not equals` for text/date, relative dates (today / this week / last N days / this month), fiscal-period buckets, current user/team, `does not contain`. Land alongside #3 since the registry is the host.

7. **Active filter chip strip in toolbar** (audit P2). Today the active-filter summary lives only inside the Filters panel. Add a small always-visible chip strip suitable for status bars / toolbars.

8. **Range paste server-side support** (audit P2). Visible-window-only paste planning is good for v0.5; document the limit and propose a server-side paste-planning contract.

For each item: where it manifests, what's wrong, suggested fix shape (1-3 paragraphs), affected packages, dependency on other items, capacity-aware priority order. Mirror worker1's #383 exactly.

**Branch:** `agent/worker2/v05-grouping-followups-planning-doc`. **Effort:** ~half day.

### After this → bsncraft migration co-pilot (filter side)

When bsncraft drafts the customers migration, your role is filter-and-grouping expertise (similar to worker1's server-grid expertise). Walk through any rough edges they hit on filter/group surfaces; those become v0.6 inputs.

### Deferred — earlier `v05-filter-discriminated-union` content (DONE)

The stretch was shipped in #384:
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
