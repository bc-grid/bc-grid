# Worker2 Handoff (Codex — filters + aggregations + chrome consistency lane)

**Last updated:** 2026-05-03 by Claude coordinator
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
- ✅ **#419** `v05-default-context-menu-wiring` chrome slice — `Column` submenu + top-level `Clear all filters` + in-memory `BcUserSettings` fallback for View toggles
- ✅ **#423** `v06-saved-view-dto-recipe` — `BcSavedView` DTO + `createSavedView` / `applySavedViewLayout` / `migrateSavedViewLayout` helpers + consumer toolbar recipe at `docs/recipes/saved-views.md`

v0.5.0-alpha.1 is **published** to GitHub Packages and bsncraft is consuming it. Coordinator cut alpha.3 with the full v0.5 surface.

### Active now → `v06-erp-filter-operators` (your planning doc §6, ~half day)

`#419`, `#423` both merged. **Filter registry + set-filter option provider + layout pass PR (b) + default context menu chrome wiring + saved-view DTO are complete.** Your v0.5 alpha.2 → GA work is structurally complete.

The next active task is **§6 of `docs/coordination/v05-audit-followups/worker2-grouping-and-filters.md`** — ERP filter operators (audit P1-W2-4). The `blank` / `not blank` operators shipped in #393 for every scalar type, but the rest are missing — `not equals` for text/date, relative dates (today / this week / last N days / this month), fiscal-period buckets, current-user/team predicates, `does not contain`. Composes with the filter registry from #410 (operators land as registry entries with predicate + editor).

Implementation:

1. **Add the missing scalar operators** to the filter registry (`packages/filters/src/`): `not-equals` for text and date types; `does-not-contain` for text. Reuse the existing predicate + editor patterns from `equals` / `contains`.

2. **Add a relative-date operator family** keyed off the host's `Date.now()` injectable: `today`, `yesterday`, `this-week`, `last-week`, `last-N-days`, `this-month`, `last-month`. The registry's predicate signature is `(value, payload, ctx) => boolean`; the host can inject `ctx.now` for SSR / test stability.

3. **Add a fiscal-period operator family** that closes over a consumer-supplied `BcFiscalCalendar` (Jan-start vs custom). Bsncraft uses calendar quarters today; document the boundary cleanly so other ERPs can ship a fiscal-year calendar.

4. **Add an active-user / active-team operator** that closes over a consumer-supplied `ctx.user`. This is the gateway to "rows assigned to me" / "rows assigned to my team" filters that ERP toolbars universally want.

**Branch:** `agent/worker2/v06-erp-filter-operators`. **Effort:** ~half day.

### Next-after → `v05-bsncraft-pinned-scroll-shadow-overlay` (RFC + implementation, ~half day)

Once the filter operators ship, pick up bsncraft P0 #4 — pseudo-element gradient at pinned boundary (`bc-grid-cell-pinned-{left,right}-edge::after/::before` at `right: -8px`, `packages/theming/src/styles.css:3587-3611`) paints over row hover bg, creating visual artifacts at the seam. Likely fix: `mix-blend-mode: multiply` so the shadow darkens the row state below instead of replacing it; alternative is negative z-index on the pseudo.

Implementation:

1. **Pick the stacking mechanism:** evaluate `mix-blend-mode: multiply` (composites the pseudo's gradient with the underlying row state — preserves hover/focused/selected colors with a darkened seam) vs `z-index: -1` on the pseudo (puts it behind the cell — works but may interact poorly with the row's own z-index stack). Recommend the `mix-blend-mode` path.

2. **Verify forced-colors mode** doesn't regress — Windows High Contrast strips colors but the shadow position should still be sensible. The existing `apps/examples/tests/forced-colors-sticky.pw.ts` from #415 covers the pinned-edge area; confirm it still passes.

3. **Test coverage:** Playwright spec at `apps/examples/tests/pinned-scroll-shadow-row-state.pw.ts` — open a master row's detail panel with a long horizontal scroll, hover a row containing a pinned cell, assert the row hover background bleeds through under the shadow gradient (no opaque seam).

**Branch:** `agent/worker2/v05-bsncraft-pinned-scroll-shadow-overlay`. **Effort:** ~half day.

> **Note:** worker3 picked up `v05-bsncraft-row-state-cascade-scoping` ahead of you (RFC #426 + impl #430). One less item on your backlog — fall straight through to the scroll-shadow overlay.

### Then-after → `v06-saved-view-storage-recipe` (consumer-side persistence layer, ~half day)

Pull a consumer-side companion to your #423 saved-view DTO PR — a recipe doc + minimal storage helpers showing how to wire a `localStorage` / `IndexedDB` / server-backed implementation behind the `BcSavedView` shape. Composes naturally with the toolbar recipe at `docs/recipes/saved-views.md`. Bsncraft will need this when they wire saved views into their AR Customers grid.

Implementation:

1. **Add `docs/recipes/saved-view-persistence.md`** showing three reference adapters:
   - `localStorage` (synchronous, single-tab) — simplest
   - `IndexedDB` via a tiny inline helper — async, multi-tab, larger payloads
   - Server-backed (`fetch`-based) — closes over the host's REST/GraphQL endpoint
2. **Document the URL boundary** — `urlStatePersistence` carries the current ad-hoc layout blob; saved views are persisted server-side or in `localStorage` keyed by `gridId`. The consumer's URL parameter (e.g. `?activeSavedViewId=`) sits next to the grid payload.
3. **Optional**: ship a tiny `createLocalStorageSavedViewStore({ gridId })` helper as a starter (still consumer-owned but skips boilerplate). Decide based on bundle cost — if it adds <250B gzip, ship; otherwise leave as recipe-only.

**Branch:** `agent/worker2/v06-saved-view-storage-recipe`. **Effort:** ~half day.

### After saved-view storage → continue down planning doc (§7+ of `worker2-grouping-and-filters.md`)

Your planning doc has additional grouping + filter items beyond §6. Pick the next at the top when you're ready.

Spec from your planning doc:

```ts
interface BcSavedView<TRow = unknown> {
  id: string
  name: string
  gridId: string
  version: number              // schema migration anchor
  layout: BcGridLayoutState     // nested, not duplicated
  scope: "user" | "team" | "global"
  ownerId?: string
  isDefault?: boolean
  isFavorite?: boolean
  createdAt?: string
  updatedAt?: string
  description?: string
}
```

Helpers:
- `createSavedView(opts: { gridId, name, layout, scope?, ... }): BcSavedView` — id generated, version pinned, timestamps set.
- `applySavedViewLayout(api: BcGridApi, view: BcSavedView): void` — applies the layout state (sort, filter, columnState, groupBy, etc.) to a live grid via apiRef.
- `migrateSavedViewLayout(view: BcSavedView): BcSavedView` — version-aware migration so older saved views remain consumable.

Toolbar recipe doc at `docs/recipes/saved-views.md` — covers the consumer UX pattern (list + load + save + delete) without bc-grid implementing the UI. Uses controlled `layoutState` + `onLayoutStateChange` + `urlStatePersistence` + host storage.

Decide whether URL state should carry only the current layout blob or also `activeSavedViewId`. Recommendation: just the blob; consumers who want the active ID round-tripped add it as their own URL param.

**Branch:** `agent/worker2/v06-saved-view-dto-recipe`. **Effort:** ~half day.

### After saved-view DTO → `v06-erp-filter-operators` (your planning doc §6, ~half day)

Pull §6 forward — ERP filter operators (audit P1-W2-4): `blank` / `not blank` for every scalar type (already shipped in #393), but the rest are missing — `not equals` for text/date, relative dates (today / this week / last N days / this month), fiscal-period buckets, current-user/team predicates, `does not contain`. Composes with the filter registry from #410 (operators land as registry entries with predicate + editor).

**Branch:** `agent/worker2/v06-erp-filter-operators`. **Effort:** ~half day.

### Previously active → `v05-default-context-menu-wiring` chrome slice (DONE — #419 in review)

### Old anchor: `v05-default-context-menu-wiring` — chrome slice (~1.5-2h)

**Layout pass PR (b) shipped as #416** (e25b2b1) — detail panel composes as `position: sticky; left: 0` with `width: var(--bc-grid-viewport-width)`; horizontal master scroll leaves the detail panel anchored to the visible viewport. Closes layout RFC §4 memo 2.

**Set filter option provider shipped as #413** (724a4af). **Filter registry shipped as #410** (ec6f6d5). Your v0.5 alpha.2 → GA work is structurally complete.

**New gap surfaced 2026-05-03 by bsncraft consumer screenshot:** `DEFAULT_CONTEXT_MENU_ITEMS` is unchanged from v0.4 — only `copy / copy-row / copy-with-headers / clear-selection / clear-range`. Chrome bundles 1+2 (#396 / #399) added the `BcContextMenuToggleItem` + `BcContextMenuSubmenuItem` primitives + new column-context built-ins (`pin-column-left/right`, `unpin-column`, `hide-column`, `show-all-columns`, `autosize-column`, `autosize-all-columns`, `clear-column-filter`, `clear-all-filters`) — but **none of them are in DEFAULT**. Bsncraft (correctly) didn't write a custom `contextMenuItems` prop, so they see only the v0.4 baseline.

The maintainer's vanilla+context-menu RFC (#392) intent — "vanilla grid by default + everything toggleable from right-click + consumer-supplied persistence API" — landed half. Workers built primitives + props; nothing wired the default menu.

**Your slice (chrome lane):** wire the column commands + view toggles into `DEFAULT_CONTEXT_MENU_ITEMS`. Specifically:

1. **Column-context items** (when right-click target has `context.column`): a `Column` submenu with `pin-column-left`, `pin-column-right`, `unpin-column`, `hide-column`, `autosize-column`, separator, `show-all-columns`, `autosize-all-columns`, `clear-column-filter`. Disabled-state predicates already exist in `contextMenu.ts:147-217`.

2. **View toggles** (always present): a `View` submenu with `Show filter row`, `Show sidebar`, `Show status bar`, `Density` (Compact / Normal / Comfortable radio), `Show active filters` (the chip-strip toggle). These need an in-memory `BcUserSettings` default when the consumer doesn't supply a `userSettings` prop. Use the existing `BcUserSettingsStore` shape from #396; add an internal `useDefaultUserSettings` fallback.

3. **Filter actions** (always present, top-level): `Clear all filters` action (existing built-in `clear-all-filters`).

worker1 + worker3 will pull their own slices (server-side toggles + editor toggles respectively) into their handoffs — your slice is the chrome+filter+column commands.

**Branch:** `agent/worker2/v05-default-context-menu-wiring-chrome`. **Effort:** ~1.5-2h.

### After context-menu wiring → `v06-saved-view-dto-recipe` (your planning doc §5, ~half day)

(Same as before — `BcSavedView` DTO + helpers + toolbar recipe doc.)

### Previously active → `v06-layout-architecture-pass` PR (b) (DONE — #416)

### Old anchor: `v06-layout-architecture-pass` PR (b) — detail panel sticky-left (~2-3h, NOW UNGATED — worker1's PR (a) shipped)

**Set filter option provider shipped as #413** (724a4af): `loadSetFilterOptions({ columnId, search, selectedValues, filterWithoutSelf, signal, limit, offset }) => Promise<{ options, totalCount?, selectedOptions?, hasMore? }>` shape per planning doc §4. Async option loading + abort-on-keystroke + selected-value preservation across searches + virtualized menu body for large option sets. Audit P1-W2-2 closed.

**Layout pass PR (a) shipped as #415** (760de4c) — single `.bc-grid-viewport` container with sticky-positioned headers + pinned cells. Your PR (b) is now unblocked: detail panel composes as `position: sticky; left: 0` with `width: var(--bc-grid-viewport-width)` set as a CSS custom property by `useViewportSync` (per layout RFC §4 memo 2 closure). Pinned-left disclosure column ▶ alignment is preserved because both anchor to `left: 0` in the viewport coordinate space.

Acceptance criteria from the original consumer thread (preserved):
- Horizontal scroll on master leaves the detail panel anchored to the visible viewport.
- Detail panel content keeps its own horizontal scroll if it overflows the viewport width.
- Vertical scroll on master scrolls the detail row off-screen as expected (no sticky-vertical).
- `detailPanelHeight` (and the row-fn variant) is still honored.
- Pinned-left disclosure column ▶ button still visually connects to the detail row's left edge.

**Branch:** `agent/worker2/v06-layout-architecture-pass-pr-b`. **Effort:** ~2-3h including a Playwright spec (coordinator runs the spec).

### After PR (b) → `v06-saved-view-dto-recipe` (your planning doc §5, ~half day)

Pull §5 forward from `docs/coordination/v05-audit-followups/worker2-grouping-and-filters.md` (audit P1-W2-3). Publish the canonical `BcSavedView` DTO + helpers (`createSavedView`, `applySavedViewLayout`, `migrateSavedViewLayout`) + a toolbar recipe doc. No runtime UI required — the DTO + helpers + recipe are the deliverable. Composes naturally with the filter-registry + set-filter-option-provider work since saved views serialize through the registry.

Spec details in your planning doc; recommend: nest `BcGridLayoutState` rather than duplicating fields, add a `version` field for schema migration, document the URL-state vs persistent-view boundary.

**Branch:** `agent/worker2/v06-saved-view-dto-recipe`. **Effort:** ~half day.

### Previously active → `v06-set-filter-option-provider` (DONE — #413)

### Old anchor: `v06-set-filter-option-provider` (your planning doc §4, ~half day)

### Previously active → `v06-filter-registry-implementation` (DONE — #410)

### Old anchor: `v06-filter-registry-implementation` (your planning doc §3, ~half day)

**Group-before-paginate shipped as #405** (e2c022c, your planning doc §1 — closes audit P0-8 grouping-page-window): the grouped row metadata now builds from the full filtered/sorted client row model, then pagination applies as a visible-leaf set so group counts and descendant ids reflect full data, not one page. Combined with row-actions menu (#404), chrome bundles 1+2 (#396 / #399), and chrome+filter bundle-1 (#393), your v0.5 lane is structurally complete.

**Note on `v06-detail-panel-sticky-left`:** the standalone task is **superseded** by the v0.6 layout architecture pass RFC at `docs/design/layout-architecture-pass-rfc.md` (delivered 2026-05-03; read §3, §4, §8 before your PR (b) work). The detail-sticky-left becomes PR (b) of that RFC, gated on worker1's PR (a) (single scroll container + sticky header/pinned). Don't ship the standalone version — it would conflict with the layout pass's structural rewrite. Coordinator will signal when worker1's PR (a) lands and you can pick up the layout-pass PR (b) as a clean compose-on-top.

In the meantime, pull §3 forward from `docs/coordination/v05-audit-followups/worker2-grouping-and-filters.md`. The audit's P1-W2-1 finding: `@bc-grid/filters` is a placeholder, custom filter definitions are advertised in the type but the registry, predicate dispatch, and editor lookup are all stubs. #384 made the built-in `BcColumnFilter` union safer; it didn't make the extension point real.

Your planning doc's spec is concrete (file:line citations at `packages/filters/src/index.ts:1`, `packages/react/src/filter.ts:334-362`, `packages/react/src/headerCells.tsx:1074-1220`, plus the registry RFC at `docs/design/filter-registry-rfc.md:188-206 / 423-436 / 459-467`). Implement:

1. **`@bc-grid/filters` package** — built-in filter definitions (text/number/date/set/boolean) as first-class registry entries, plus `matchesFilter` predicate dispatch and a `registerFilter` API.
2. **React adapter** — resolves a column's filter definition to (editor, parse/serialize, predicate) via the registry. Built-ins use the same registry path as registered filters.
3. **Failure mode** — unknown filter types fail loudly in development (console.error per the same dev-only pattern as the server-row-model validator surfacing) and produce a safe no-match in production rather than silently pretending to be text.

Tests: registry lookup, duplicate-registration detection, built-in parity (registered text filter behaves identically to today's hardcoded text filter), unknown-type behavior, custom editor rendering, controlled filter evaluation, URL/localStorage round-trips through the registry.

**Branch:** `agent/worker2/v06-filter-registry-implementation`. **Effort:** ~half day.

### After filter-registry → `v06-set-filter-option-provider` (your planning doc §4, ~half day)

Pull §4 forward — set filter scales to thousands of distinct values via an async option provider. Audit P1-W2-2 finding: the current set filter synchronously scans `data` and renders all options at menu-open, which doesn't scale to thousands of customers/vendors/items. No virtualization, no async search, no abort, no loading state.

Your planning doc's spec:

```ts
loadSetFilterOptions({
  columnId, search, selectedValues, filterWithoutSelf, signal, limit, offset,
}) => Promise<{
  options, totalCount?, selectedOptions?, hasMore?
}>
```

Plus a small-data sync adapter that preserves today's behavior for grids that don't supply the provider (so it's additive, not breaking).

Implementation:
- Virtualize the menu body for large option sets (reuse `@bc-grid/virtualizer` if the listbox shape fits).
- Server-backed search with abort-on-keystroke (mirror the autocomplete pattern from #370/#403).
- "Selected values hidden by current search" preserved as a distinct section in the menu so the user always sees what they've already selected.
- "Select all" semantics — clearly means "all currently loaded matching options" unless the provider declares it supports all-matching values.

Tests: 1k and 10k option fixtures, async race handling, selected-value preservation across searches, `not-in` / `blank` behavior, AbortSignal cancellation.

**Branch:** `agent/worker2/v06-set-filter-option-provider`. **Effort:** ~half day.

### After set-filter-option-provider → `v06-layout-architecture-pass` PR (b) — detail panel sticky-left (~2-3h, GATED on worker1's PR (a))

The standalone `v06-detail-panel-sticky-left` task is replaced by PR (b) of the v0.6 layout architecture pass (RFC drafting at `docs/design/layout-architecture-pass-rfc.md`). PR (a) — single scroll container + sticky header/pinned (worker1) — is the foundation. Once it merges, your PR (b) becomes a clean compose-on-top: detail panel wrapper sets `position: sticky; left: 0` inside the canvas with `width: 100%` of the viewport's `clientWidth` (no JS measurement — sticky positioning gives you that for free in the new architecture).

Acceptance criteria from the original consumer thread (preserved):

- Horizontal scroll on master leaves the detail panel anchored to the visible viewport.
- Detail panel content keeps its own horizontal scroll if it overflows the viewport width.
- Vertical scroll on master scrolls the detail row off-screen as expected (no sticky-vertical).
- `detailPanelHeight` (and the row-fn variant) is still honored.
- Pinned-left disclosure column ▶ button still visually connects to the detail row's left edge (composes naturally with PR (a)'s sticky-positioned pinned cells).

**Coordinator will signal when PR (a) lands.** Until then, do NOT branch on this — PR (a)'s architectural rewrite changes the detail panel mount path, and any work you do here would conflict.

**Branch (when ready):** `agent/worker2/v06-layout-architecture-pass-pr-b`. **Effort:** ~2-3h.

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
