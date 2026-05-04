# Worker1 Handoff (Claude — server grid stability lane)

**Last updated:** 2026-05-04 by Claude coordinator

## ⚙ ARCHITECTURE CORRECTION 2026-05-04 — your lane is UNCHANGED

**Read `docs/design/shadcn-radix-correction-rfc.md` for context.** Maintainer audit found bc-grid drifted from the day-1 shadcn/Radix-first architecture; worker2 owns the chrome migration (PR-A1 → PR-B4) and worker3 owns the editor migration (PR-C1 → PR-C3). **Worker1 stays on the server-grid lane through the correction** — your work is independent of the chrome/editor primitive layer. Top priority remains #455 rebase below; once that lands, continue down your existing v0.6 server queue (server-tree-expansion-persistence, export-csv-server-page-stream).

The one constraint: **do not add new code under `packages/react/src/internal/*`** during the correction window. If your server-grid work needs a new chrome primitive (e.g., a server-status badge that wants a popover), wait for worker2's PR-B3 to land first and route through Radix Popover.

---

## 🚨 ONE PR LEFT 2026-05-04 — rebase #455 phase 3 on new main

**Update 2026-05-04 PM:** ✅ #470 cache stats and ✅ #452 client tree phase 2.5 both rebased + merged into the alpha.3 train. Only **#455 client tree phase 3 production-readiness** remains DIRTY.

The phase 3 PR was stacked on phase 2.5 (#452); now that #452 has merged to main, four of your own files conflict on the rebase: `packages/react/src/clientTree.ts`, `packages/react/src/grid.tsx`, `packages/react/tests/clientTree.test.ts`, `packages/react/tests/clientTreeIntegration.test.tsx`, plus `docs/queue.md`. Coordinator-side resolution is risky because it's hard to tell which side has the canonical phase 3 changes vs the stale phase 2.5 starting point — please rebase from `~/work/bcg-worker1` on the new main and force-push. Once it goes UNSTABLE/CLEAN it lands in alpha.3.

Do not start `v07-*` tasks until #455 lands. Coordinator will run perf + Playwright on it post-merge.

---

## ⚡ Fresh items added 2026-05-04 (post bsncraft-issues sweep)

The bsncraft-issues.md tasks assigned earlier today **all merged**: dev-mode error surface (#474), ServerMutationResult.row doc (#475), flex-resize fix (#476), dual-output RFC (#477), cellEditor union widen (#478), Option B P0 fix (#479), createTextEditor (#480), multi-cell delete (#471), paste-into-cell (#467), error boundary (#468), keyboard shortcuts (#464). All three workers' queues drained almost entirely.

Pickups remaining in this handoff are queued below. **Pull main and rebase any in-flight branches before continuing — main has moved a lot today.**

**Coordinator note:** worker3's caveat from the pinned-lane RFC verdict still needs verification — `<BcServerGrid rowModel="tree">` group rows under the new 3-track template (Option B). Queued as `v06-tree-mode-option-b-regression-test` on worker1 since group rows live in the server-tree path.

---


## ⏸ URGENT: review needed on pinned-lane positioning RFC

**Maintainer asked for a group decision** on the v0.6.0-alpha.1 pinned-right CSS architecture before coordinator picks a fix. Read `docs/coordination/pinned-lane-positioning-decision.md` and add your verdict at the bottom (~30 sec — pick option A/B/C/D/E + 2-4 lines on why for your lane). Coordinator merges + ships once all 3 workers have weighed in.

---

**Worktree:** `~/work/bcg-worker1`
**Branch convention:** `agent/worker1/<task-slug>`

## How to use this document

When the maintainer says **"review your handoff"**, read the **Active task** section below and proceed. This document is the source of truth for what worker1 should be doing right now. The Claude coordinator in `~/work/bc-grid` keeps it current.

## Hard rule — workers do NOT run Playwright / e2e / smoke-perf / perf / broad benchmarks

This is binding (`docs/AGENTS.md §6`). Workers run focused unit tests + `bun run type-check` + `bun run lint` + the affected package's build. **Never** run `bun run test:e2e`, `bun run test:smoke-perf`, `bun run test:perf`, `bunx playwright`, or broad benchmark commands. The coordinator runs those during review/merge. If your change adds or modifies a `.pw.ts` file, note in the PR that it was not run locally — the coordinator will run it.

You implement code; the coordinator reviews and runs the slow gates.

---

## Active task — v0.5: server-tree polish + bsncraft migration co-pilot (updated 2026-05-02 evening)

### What's already shipped from your lane

- ✅ **#353** `rowProcessingMode` — went out in `v0.4.0`
- ✅ **#360** worker1 audit findings doc
- ✅ **#363** `useServerPagedGrid` turnkey orchestration hook (audit P0-6)
- ✅ **#366** `apiRef.scrollToCell` + `useServerPagedGrid.scrollToServerCell` action (audit P0-7 server-side)
- ✅ **#368** `useServerInfiniteGrid` + extracted `internal/useServerOrchestration.ts`
- ✅ **#371** `useServerTreeGrid` companion hook — closes the server-hook trio (paged + infinite + tree)
- ✅ **#376** `v05-server-loader-generics` deferral doc — TS variance trap; stretch deferred to v0.6 with rationale
- ✅ **#379** `useServerTreeGrid` `groupRowId` override + `persistTo` (bsncraft polish)
- ✅ **#383** v0.5 → v0.6 server-perf follow-ups planning doc — 11 v0.6 task proposals + 5 open questions for coordinator
- ✅ **#389** `useServerTreeGrid` `rootChildCount` / `pageSize` / `cacheLimit` options pulled forward from v0.6 backlog
- ✅ **#391** v0.5 server-perf bundle-1 (LRU eviction tuning + `prefetchAhead` knob + stale-flood test + per-row request-id supersedure)
- ✅ **#420** `v05-default-context-menu-wiring` server slice — `Server` submenu (`Show pagination`, `Expand all groups`, `Collapse all groups`)
- ✅ **#422** `v06-server-perf-block-cache-lru-tuning` — LRU eviction order unit tests + smoke-perf bench (your planning doc §5)
- ✅ **#428** `v06-server-infinite-prefetch-budget` — `prefetchAhead` knob + Server submenu Prefetch ahead radio + 5 contract tests + 4-budget bench sweep. Merged 86b9810.

## v0.6 train — your queue (in priority order)

**0.5.0 GA shipped 2026-05-03.** v0.6 is consumer-feedback absorption + spreadsheet flows + bulk operations + state-persistence. Target ship date: ~2026-05-10. v0.6.0-alpha.1 cut imminent.

You crushed the previous queue — **all 5 v0.6 server-perf items + the client-tree-rowmodel headline merged**: #433 stale-response-flood, #434 stale-viewkey-fetches, #438 client-tree RFC + #447 client-tree phase 1 (HEADLINE), #444 view-change-reset, #445 rollback-vs-invalidate. Updated queue below picks up where your planning doc left off + adds three consumer-facing follow-ons.

**bsncraft consumer issues triage 2026-05-04** (`docs/coordination/bsncraft-issues.md`): three items on this lane (all SHIPPED — see the Fresh items notice above for PR numbers). New active task below.

## ⚡ Fresh items added 2026-05-04 (round 2)

You shipped the bsncraft-issues set + Option B regression guard + skeleton rows. Queue thinned. Three new items below pulling from your planning doc §2-§4 + a v1.0 prep task. Plus the dual-output / cursor-pagination IMPL pickups remain queued from earlier.

### Active now → `v06-body-cell-memoisation` (planning doc §2, ~half day)

Per `docs/coordination/v05-audit-followups/worker1-server-perf.md` §2: extract a memoized `<BodyCell />` from `renderBodyCell` in `bodyCells.tsx`. Per visible cell × per render is 300-1500 invocations on a 30-row × 10-30-column grid; every sort/filter/hover/focus/scroll triggers a parent re-render. Sales-estimating formula columns + document-management per-cell thumbnails will exhaust today's headroom.

**Memo key:** `(entry.rowId, column.columnId, value, formattedValue, searchText, selected, focused, editingCell, rowEditState)`. **Do NOT memoize on the column object** — `consumerResolvedColumns` recreates per render.

**Bench:** add 50k × 30 paged mode with active sort+filter+1Hz scroll churn at `apps/benchmarks/tests/perf.perf.pw.ts`. Compare before/after on cell render time + scroll FPS. `React.memo` has comparison overhead so verify net positive.

**Branch:** `agent/worker1/v06-body-cell-memoisation`. **Effort:** ~half day.

### Next-after → `v06-block-error-affordance` (planning doc §3, ~half day)

Per planning doc §3: when `loadBlock` rejects, blocks stay silently empty until user re-scrolls. No visible signal to the user. Document-management on flaky VPN currently swallows whole pages of rows.

Add: per-block status surface with `loading | error | retrying` row-gutter affordance + `onBlockError` callback for consumer toasts. Auto-retry with 1-3 backoff attempts before marking permanently failed.

**Branch:** `agent/worker1/v06-block-error-affordance`. **Effort:** ~half day.

### Then-after → `v06-server-display-column-order` (planning doc §4, ~half day)

Per planning doc §4: column drag-reorder doesn't reach the server query. `view.visibleColumns` is source-order; user-driven order is in `columnState[i].position` but never threaded through. Export-to-Excel workflows export in source order, not display order.

Add `resolveServerDisplayColumns(columns, columnState)` helper + thread both `view.visibleColumns` (set) and `view.displayColumnOrder` (sequence) into the server query. Document the distinction.

**Branch:** `agent/worker1/v06-server-display-column-order`. **Effort:** ~half day.

### After-that → `v06-server-tree-expansion-persistence` (~half day)

Bsncraft anticipated polish: today's `<BcServerGrid rowModel="tree">` clears expansion state on every viewKey change (filter, sort, search). User filters by Customer Type, expands a group, clears the filter — group is collapsed again. Frustrating for explore-then-narrow workflows.

**Implementation:**
1. **`BcServerTreeProps.preserveExpansionOnViewChange?: boolean`** (default `false` — preserves current behavior). When `true`, expansion state survives viewKey changes; the grid re-fetches children for still-visible expanded nodes after the new view's parents resolve.
2. Composes with `v06-server-view-change-reset-policy` (#444) — same opt-out family. Document together.
3. Test: server-tree under filter change with `preserveExpansionOnViewChange={true}` → assert visible expanded groups stay open after filter applies.

**Branch:** `agent/worker1/v06-server-tree-expansion-persistence`. **Effort:** ~half day.

### Then-after → `v06-export-csv-server-page-stream` (~half day, recipe + helper)

Every ERP master grid eventually needs "Export all to CSV." Server-paged grids only have one page in memory at a time, so this requires walking pages on the server side. Add a recipe + thin helper:

1. **Recipe** at `docs/recipes/server-grid-csv-export.md` showing the consumer pattern: `<ExportButton>` calls `apiRef.current?.getExportPlan()` to get current view (filter/sort/groupBy/visibleColumns), POSTs to consumer's server endpoint, server streams pages into CSV.
2. **Helper:** `BcGridApi.getExportPlan(): { view: ServerViewState, visibleColumns: ColumnId[], formatCellValue: (col, row) => string }` — pure function returning everything a consumer needs to build the export payload.
3. **Optional thin client-side helper:** `streamServerGridToCsv({ apiRef, loadPage, onProgress })` — walks `loadPage` page-by-page, formats each row, emits CSV string chunks. Zero server changes; works against any server with `loadPage` already wired.

**Branch:** `agent/worker1/v06-export-csv-server-page-stream`. **Effort:** ~half day.

### Then → `v07-api-surface-freeze-audit` (~1 day, **v1.0 prep**)

Walk every entry in `tools/api-surface/src/manifest.ts`. For each runtime export + type export, verify:
1. **Intentional and stable** — meant to be public, naming holds up at 1.0.
2. **No `__internal` leaks** — anything still marked internal-flavored (`serverRowEntryOverrides`, ref-shaped escapes) should be moved to a `__internal` namespace OR explicitly accepted as public.
3. **Cross-package symmetry** — types in `@bc-grid/core` re-exported from `@bc-grid/react` (and vice versa for filter types) match shapes.

Output: a doc at `docs/design/v1-api-surface-audit.md` with one table row per export — Status (LOCK / RENAME / INTERNALIZE / DEPRECATE / KEEP-AS-IS) + brief rationale. v1.0 ships only after every export has a verdict.

**Branch:** `agent/worker1/v07-api-surface-freeze-audit`. **Effort:** ~1 day. **v1.0 prerequisite.**

### Then-active → `v06-tree-mode-option-b-regression-test` (~half day, worker3 caveat from pinned-lane RFC)

Worker3 flagged in their pinned-lane RFC verdict (#473): "verify `<BcServerGrid rowModel="tree">` group rows still render correctly under Option B" (the new 3-track template `auto minmax(0, 1fr) auto` shipped in #479). Group rows currently rely on `renderGroupRowCell` rendering a single full-width cell that spans all data columns; the v0.5 implementation used `aria-colspan` + a row-spanning track via the old `--bc-grid-columns` template.

**Verify, then ship:**

1. **Visual + DOM check** — open `apps/examples/?serverModeSwitch=1` (or the closest server-tree demo), expand a group, inspect the group row's DOM. Group cells should still span the full row width with no visual layout shift from the 3-track template.

2. **If broken**: add `.bc-grid-row[data-bc-grid-row-kind="group"]` rule with `display: block` (or a row-spanning grid track) on top of Option B. Per worker1's verdict caveat. Pin the contract with a Playwright spec at `apps/examples/tests/server-tree-group-rows.pw.ts`.

3. **If correct**: ADD the Playwright spec anyway as a regression guard so this exact bug doesn't return when someone next touches the row template. Bsncraft v0.6.0-alpha.1 P0 is the case study for "fix-for-X breaks-for-Y" architecture failures.

**Branch:** `agent/worker1/v06-tree-mode-option-b-regression-test`. **Effort:** ~half day.

### Next-after → `v06-use-server-tree-grid-dual-output` IMPLEMENTATION (~1 day, after #477 RFC ratifies)

The dual-output RFC #477 just merged. Now implement: `bound` output for plain `<BcGrid>` + `serverProps` output for `<BcServerGrid>` on `useServerTreeGrid`, `useServerPagedGrid`, `useServerInfiniteGrid`. Per the RFC sequencing.

**Branch:** `agent/worker1/v06-use-server-grid-hooks-dual-output-impl`. **Effort:** ~1 day.

### Then-after → `v06-server-paged-cursor-pagination` IMPLEMENTATION (~1 day, after #462 RFC)

Cursor-pagination RFC merged. Implement: `LoadServerPageCursor<TRow>` signature + internal pagination state machine + recipe. Per `docs/design/server-paged-cursor-pagination-rfc.md`.

**Branch:** `agent/worker1/v06-server-paged-cursor-pagination-impl`. **Effort:** ~1 day.

### After-that → `v06-tree-validator-error-surfacing` (bsncraft P1 #12, ~30 min, dev-mode only)

Bsncraft consumer report: `validateTreeResult` correctly throws on shape mismatches in `server-row-model/src/index.ts`, but the throw is caught silently in `loadTreeChildren`'s `.catch()` and surfaces only as a blank grid with no console message. A real consumer lost ~30 minutes diagnosing because the contract ("`childCount` echoes the *requested* size, not the returned row count") is non-obvious.

**Implementation:**

1. Find the `.catch()` block in `loadTreeChildren` (`packages/react/src/serverGrid.tsx` tree path) that swallows the error.
2. Add a dev-mode `console.error("[bc-grid] tree result rejected: ...", error)` BEFORE the swallow. Gate on `process.env.NODE_ENV !== "production"` so prod stays silent (the error already feeds the existing model-state error field for UI surfacing).
3. Same treatment for `loadInfiniteBlock` and `loadServerPage` if they have analogous swallow-then-degrade paths.

**Branch:** `agent/worker1/v06-tree-validator-error-surfacing`. **Effort:** ~30 min. **3-line PR.**

### Next-after → `v06-server-mutation-result-row-doc` (bsncraft P1 #15, ~15 min, doc-only)

Bsncraft consumer report: after accepted mutations, host returns `{ status: "accepted", row: <something> }`. Multiple plausible shapes (full canonical row vs partial patch vs only changed fields populated) all pass the validator. Consumers will land on different conventions without explicit docs.

**Implementation:** add a JSDoc clarification to `ServerMutationResult.row` in `packages/core/src/index.ts` (or wherever the type lives). Specify: full canonical row (replacement semantics — bc-grid replaces the row in cache with this value, doesn't merge field-by-field). ~3 lines of JSDoc + one sentence in `docs/api.md`.

**Branch:** `agent/worker1/v06-server-mutation-result-row-doc`. **Effort:** ~15 min.

### Then-after → `v06-use-server-tree-grid-dual-output` (bsncraft P1 #14, ~1 day)

Bsncraft consumer report: `useServerTreeGrid` returns `Omit<BcServerTreeProps<TRow>, "columns">` only. Consumers wrapping a plain `<BcGrid>` (not `<BcServerGrid rowModel="tree">`) can't use the hook without switching components. Same gap exists for `useServerPagedGrid` and `useServerInfiniteGrid`.

**Implementation:** dual-output refactor matching the coordinator's v0.5-alpha.1 estimate (~1 day):

1. **`bound`** — `BcGridProps`-shaped output for plain `<BcGrid>` consumers (data array + controlled callbacks for sort/filter/pagination/groupBy/expansion).
2. **`serverProps`** — `BcServerTreeProps`-shaped output for `<BcServerGrid>` consumers (current behavior).

Both share the same internal orchestration; the hook wraps them. Same dual-output applied to `useServerPagedGrid` and `useServerInfiniteGrid` for symmetry.

**Recipe** at `docs/recipes/server-grid-without-bcservergrid.md` showing the `bound` path so consumers with custom grid wrappers (bsncraft case) can adopt the hooks without switching components.

**Branch:** `agent/worker1/v06-use-server-tree-grid-dual-output`. **Effort:** ~1 day. **Two-spike-confirmed** (bsncraft uses their own wrapper, not `<BcServerGrid>` directly).

### After-that → `v06-client-tree-rowmodel-phase-2` (~1 day, headline polish)

Phase 1 (#447) shipped the foundation: `treeData`, outline column, sort + filter through tree, aggregations integration. Phase 2 closes the production-readiness gaps the RFC §10 open questions surfaced:

1. **Performance pass** — add a smoke-perf bench under `apps/benchmarks/tests/perf.perf.pw.ts` for client tree: 5k-row tree (~10 levels deep, ~50 children per parent on average) with sort + filter applied. Bar: under 200ms initial flatten + under 50ms expand-toggle. Tune the tree-build algorithm if numbers are loose.

2. **Cycle-handling policy** — phase 1 deferred this. Add an explicit cycle detector in `flattenClientTree` that drops rows participating in a cycle + emits a dev-mode warning. Pin the contract with a unit test where row A's parentId = B and B's parentId = A.

3. **`keepAncestors` prop wiring** — phase 1 ratified the toggle but the implementation may have shipped the default-only path. Verify `BcGridProps.treeData.keepAncestors?: boolean` (default `true`) wires through; add a test exercising both sides.

4. **Outline column ergonomics** — chevron animation timing, indent token (`--bc-grid-tree-indent`), `aria-expanded` semantics, keyboard support (Right = expand if collapsed else move-into-children; Left = collapse if expanded else move-to-parent). Match the master-detail toggle's existing accessibility contract.

**Branch:** `agent/worker1/v06-client-tree-rowmodel-phase-2`. **Effort:** ~1 day.

### Next-after → `v06-server-paged-cursor-pagination` (~1 day)

Today's `LoadServerPage<TRow>` signature passes `pageIndex` + `pageSize` (offset-based). Some consumer backends — Hasura/Postgres-with-keyset, GraphQL-with-cursor, Algolia-search-style — only support cursor-based pagination natively. Forcing them to translate pageIndex → cursor adds latency and breaks "stable scroll while data inserts" guarantees.

**Fix shape:**

1. **Add `LoadServerPageCursor<TRow>`** as an alternative loader signature on `BcServerPagedProps`. Receives `{ cursor: string | null, pageSize, signal, view }` and returns `{ rows, nextCursor: string | null, totalRows? }`.

2. **Discriminate via a single union prop** — `loadPage: LoadServerPage<TRow> | { kind: "cursor", load: LoadServerPageCursor<TRow> }`. Or two distinct props (`loadPage` vs `loadPageCursor`) — pick whichever survives api-surface review better.

3. **Internal pagination state machine** keeps one set of {prev, next} cursors instead of pageIndex. The visible row range is computed from cursor → cumulative rows, not pageIndex → offset.

4. **Recipe doc** at `docs/recipes/cursor-pagination.md` showing Hasura + GraphQL examples.

**Branch:** `agent/worker1/v06-server-paged-cursor-pagination`. **Effort:** ~1 day.

### Then-after → `v06-server-grid-error-boundary` (~half day)

Today when `loadPage` throws, the `<BcServerGrid>` shows the empty state (no error UI). Consumers wire their own error catching. Add a first-class error surface:

1. **`BcServerGridApi.getLastError()`** — returns the most recent failed-load error (or null).
2. **`BcGridProps.renderServerError?: (params: { error, retry }) => ReactNode`** slot — consumer renders the error UI; receives a `retry()` thunk that re-fires the active `loadPage`.
3. **Default fallback** if `renderServerError` is unset: minimal "Failed to load. Retry" button (uses `--bc-grid-edit-state-error-*` tokens for theme consistency).
4. **Recipe** at `docs/recipes/server-grid-error-handling.md`.

**Branch:** `agent/worker1/v06-server-grid-error-boundary`. **Effort:** ~half day.

### After-that → `v06-server-row-cache-stats` (~half day)

`BcServerGridApi.getCacheStats(): { blocksLoaded, blocksFetched, dedupedRequests, cacheHitRate, viewKey, ... }`. Consumer observability for production tuning — they can render the stats in a dev panel during integration. Pulls existing diagnostics from the model's internals; pure additive API.

**Branch:** `agent/worker1/v06-server-row-cache-stats`. **Effort:** ~half day.

### Last → `v06-server-paged-skeleton-rows` (~half day)

Opt-in skeleton placeholder rows while a page loads instead of empty space. `BcGridProps.serverLoadingSkeleton?: "lines" | "shimmer" | false` (default `"lines"`). Renders `pageSize` skeleton rows in the right offset range so scrolling feels continuous. Composes with #428's prefetch radio — when prefetched blocks are in flight, those rows show skeletons too.

**Branch:** `agent/worker1/v06-server-paged-skeleton-rows`. **Effort:** ~half day.

### Previously active → `v06-client-tree-rowmodel` phase 1 (DONE — #447 merged b669e0f, HEADLINE)
### Previously active → `v06-stale-response-flood-test` (DONE — #433 merged 236d712)
### Previously active → `v06-server-tree-stale-viewkey-fetches` (DONE — #434 merged 97faaa6)
### Previously active → `v06-server-view-change-reset-policy` (DONE — #444 merged 28a4f47)
### Previously active → `v06-optimistic-rollback-vs-invalidate` (DONE — #445 merged debe776)
### Previously active → `v06-server-infinite-prefetch-budget` (DONE — #428 merged 86b9810)

### Previously active → `v06-server-perf-block-cache-lru-tuning` (DONE — #422 merged 976344c)

### Old anchor: `v05-default-context-menu-wiring` — server + pagination slice (~1-1.5h)

**Stage 3.3 shipped as #417** (178d9d7) — RFC §9 carry-over test sweep + 1 Playwright happy-path. Mode-switch RFC fully implemented across stages 1, 2, 3.1, 3.2, 3.3 (#397 / #400 / #402 / #406 / #417). **Polymorphic `useServerGrid` hook also shipped** as #409 (928d9d7). bsncraft can adopt either the legacy three-hook pattern OR the new polymorphic hook.

**New gap surfaced 2026-05-03 by bsncraft consumer screenshot:** `DEFAULT_CONTEXT_MENU_ITEMS` is unchanged from v0.4. Chrome bundle PRs added the `BcContextMenuToggleItem` + `BcContextMenuSubmenuItem` primitives + new built-ins, but **none of them are in DEFAULT**. Your `showPagination` prop (#394) and `useServerTreeGrid().actions.expandAllGroups()` / `collapseAllGroups()` are reachable only via consumer-supplied `contextMenuItems`.

**Your slice (server + pagination lane):** wire the server-side toggles into the default context menu.

1. **Server submenu** (always present when grid is `<BcServerGrid>` — derive from `BcServerGridApi.getActiveRowModelMode()`): `Show pagination` (toggle reading `showPagination`), separator, server-tree-only items: `Expand all groups` / `Collapse all groups` (call `useServerTreeGrid` actions). Use the active-mode probe to gate the tree-mode items.

2. **Prefetch budget submenu** (when the active mode is `infinite`): `Prefetch ahead` → `0 / 1 (default) / 2 / 3 blocks` radio. Reads + writes the `BcServerInfiniteProps.prefetchAhead` prop via `BcUserSettings`.

3. **Pagination mode toggle** (when active mode is `paged`): `Server pagination` toggle — `Server-paged` (default) vs `Load all visible`. The latter calls `loadPage` with no pagination param so consumers can disable pagination on a small server.

worker2 (chrome + column + view) + worker3 (editor + row actions) will own their own slices.

**Branch:** `agent/worker1/v05-default-context-menu-wiring-server`. **Effort:** ~1-1.5h.

### After context-menu wiring → bsncraft migration co-pilot (consumer-paced) OR pull v0.6 server-perf

Same as before — when bsncraft's customer migration draft surfaces, your role is server-grid expertise. Until then, pull v0.6 server-perf items forward from your planning doc.

### Previously active → `v05-server-mode-switch` stage 3.3 (DONE — #417)

### Old anchor: `v05-server-mode-switch` stage 3.3 — RFC §9 test sweep + Playwright (~3-4h)

**Layout pass PR (a) shipped as #415** (760de4c, ~2-week single-PR train of structural rewrite) and **polymorphic `useServerGrid` hook shipped as #409** (928d9d7, alpha.3 / GA scope per RFC §6 + §7 + Q6). The layout pass deleted ~250 LOC of JS scroll-sync (`syncHeaderRowsScroll`, `pinnedTransformValue`, `headerScrollTransform`, `pinnedLaneStyle`, `headerViewportStyle`, `autoHeightHeaderViewportStyle`, `headerRowStyle`, the per-cell `transform` from `cellStyle`); single `.bc-grid-viewport` container; sticky-positioned headers + pinned cells. **Bundle hard cap raised 100 → 150 KiB** to absorb the v0.6 feature train (decision in design.md §13).

Stage 3.3 closes the mode-switch RFC: 14 unit cases covering each carry-over dimension per RFC §9 (sort / filter / searchText / groupBy / columnState / pageSize / expansion-drop / selection / rangeSelection-drop / focusedRowId / scroll / viewKey / pending-mutations-settled / block-cache-dropped) + 1 Playwright happy-path covering the bsncraft case (paged↔tree switch with filter / sort / focused-cell / selection all carried). Runtime behavior already in main from stages 1-3.2; stage 3.3 pins the contract.

**Branch:** `agent/worker1/v05-server-mode-switch-stage-3-3`. **Effort:** ~3-4h.

### After stage 3.3 → bsncraft migration co-pilot (consumer-paced) OR pull v0.6 server-perf items forward

bsncraft is now consuming v0.5.0-alpha.2 + can adopt the polymorphic `useServerGrid` hook. When their migration draft opens, your role is server-grid expertise. Until then, pull a v0.6 server-perf item forward from `docs/coordination/v05-audit-followups/worker1-server-perf.md` if you want to keep momentum (LRU eviction tuning under realistic ERP scroll patterns, prefetch-ahead budget calibration, optimistic-edit rollback under concurrent invalidations, etc.).

### Old anchor: `v06-layout-architecture-pass` PR (a) — single scroll container + sticky header/pinned (~12-16h)

### Old anchor: `v06-layout-architecture-pass` PR (a) — single scroll container + sticky header/pinned (~12-16h)

**Stages 1-3.2 of the server-mode-switch RFC all shipped** (1e2c043, 5fc890f, 0db97a1, 772a3b6). The structural mode polymorphism + pending-mutation grace + abort-on-deactivate are all in main; only the 14-dimension carry-over test sweep + Playwright spec remain as RFC §9 follow-up (worth a small PR after PR (a) below if your alpha.2 lane has bandwidth).

**The next active task is the v0.6 layout architecture pass.** bsncraft consumer review surfaced 5 layout memos in the past 24h — pinned-cell shading, sticky-left detail panel, editor portal mispositioning, nested-grid flex distribution, header-body horizontal scroll lag. 3 of 5 are shipped as point fixes; 2 remain. Maintainer's framing: they share a root cause — bc-grid's render layer uses JS-driven coordinate calculations where the browser layout engine has the right primitives (`position: sticky`).

**RFC delivered** at `docs/design/layout-architecture-pass-rfc.md`. Read end-to-end before you start; §3 has the new render graph, §5 covers the z-index intersection rule (the only sharp edge), §8 is the PR sequencing.

**PR (a) scope (yours):** structural DOM rewrite — single `.bc-grid-viewport` (**hard-renamed** from `.bc-grid-scroller` per §10 Q2 — no alias), `position: sticky; top: 0` on the three header rows (group, leaf, filter), `position: sticky; left: 0 / right: 0` on `.bc-grid-cell-pinned-left/right`. Z-index 4 on the top-left intersection cells per §5. Delete `headerScrollTransform`, `pinnedTransformValue`, `headerViewportStyle`, `autoHeightHeaderViewportStyle`, `headerRowStyle`, `syncHeaderRowsScroll`, `pinnedLaneStyle`, the per-cell `transform` from `cellStyle`. **No `legacy: true` toggle** (§10 Q5). The body scroll handler shrinks to just feeding the virtualizer (~5 lines). Existing pinned-cell shading layering (5341af3) composes naturally because sticky positioning is per-cell.

**Ship with PR (a):**
- `tests/forced-colors-sticky.pw.ts` (§10 Q3 ratified) — verifies sticky positioning composes with the existing forced-colors fallbacks.
- Migration notes (§10 Q4 ratified) — `docs/migration/v0.6.md` (create if missing) covers (a) the `.bc-grid-scroller` → `.bc-grid-viewport` hard-rename for consumer style overrides + (b) the iOS Safari caveat: sticky positioning breaks if a transformed ancestor wraps `<BcGrid>` (CSS slide-in animations, drawer transitions). Bsncraft doesn't currently wrap the grid in a transform; future consumers might.

Closes memo 5 (header lag) immediately and memo 1 (pinned shading) preserved. Your lane because you have the most React layout context from the mode-switch RFC and the broadest read across `grid.tsx`.

**Branch:** `agent/worker1/v06-layout-architecture-pass-pr-a`. **Effort:** ~12-16h structural rewrite, ~600-900 LOC net diff (plus ~80 LOC for the forced-colors spec + ~40 LOC migration doc).

### After PR (a) → `v05-server-mode-switch` stage 3.3 — RFC §9 test sweep + Playwright (~3-4h)

The 14-dimension carry-over unit cases per RFC §9 + 1 Playwright happy-path covering the bsncraft case (paged↔tree switch with filter / sort / focused-cell / selection carried). Stage 3.2 (#406, 772a3b6) shipped the runtime behavior; stage 3.3 pins the contract.

**Branch:** `agent/worker1/v05-server-mode-switch-stage-3-3`. **Effort:** ~3-4h.

### Previously active → mode-switch stages 1, 2, 3.1, 3.2 (DONE)

#397 (1e2c043) Stage 1 additive apiRef. #400 (5fc890f) Stage 2 props collapse. #402 (0db97a1) Stage 3.1 runtime polymorphism + abort-on-deactivate. #406 (772a3b6) Stage 3.2 pending-mutation grace + sync loading frame.

### After mode-switch ships → `v05-use-server-grid-polymorphic-hook` (alpha.3 / GA scope, ~6-8h)

Per RFC §6 + §7 + Q6 ratification: once the structural mode-polymorphism in `<BcServerGrid>` ships in alpha.2, layer the polymorphic `useServerGrid` hook on top in a separate alpha.3 / GA PR. Composes with the structural change rather than reshaping it. Recommended-path replacement for the three single-mode hooks (which stay as escape-hatches per Q6).

Surface (from RFC §6):

```ts
export function useServerGrid<TRow>(
  opts: UseServerGridOptions<TRow>,
): UseServerGridResult<TRow>
```

Where `UseServerGridOptions<TRow>` accepts `loadPage?` / `loadBlock?` / `loadChildren?` (consumer supplies the loaders for the modes they want to support), plus the same `gridId` / `rowId` / `initial` shape from the existing turnkey hooks. The hook owns one debounce, one mutation-id stream, one `apiRef`, one controlled `groupBy` pair; on `groupBy` change it routes to the matching loader.

Should reuse the carry-over machinery you build in the alpha.2 structural change (most of the hook is plumbing on top of it). New surface in `tools/api-surface/src/manifest.ts` for `@bc-grid/react`: `useServerGrid` + `UseServerGridOptions` + `UseServerGridResult` + state/actions types. Update `docs/api.md §5.3` to mark the new hook as the recommended path.

**Branch:** `agent/worker1/v05-use-server-grid-polymorphic-hook`. **Effort:** ~6-8h, single PR. Lands in alpha.3 / GA.

### Previously active → `v05-server-perf-bundle-1` (DONE — #391)

The 4 server-perf items from your own #383 doc landed as a single coherent PR (LRU eviction tuning §5, prefetch knob §8, stale-flood test §9, per-row request-id supersedure §10).

**Items:**

1. **`§5 — block-cache LRU eviction tuning`** — verify the default `maxBlocks: 20` against realistic ERP scroll patterns (5k+ rows with rapid up/down scrolling). Either confirm the default is right with a unit test pinning the eviction order, or expose a `maxBlocks?: number` option on `useServerInfiniteGrid` so consumers can tune.

2. **`§8 — prefetch-ahead budget knob on useServerInfiniteGrid`** — the hook spec didn't expose `prefetchAhead?: number` because there was no underlying knob; wire it through the orchestration model. Default sensible (e.g. 1 block ahead).

3. **`§9 — stale-response handling under requestId floods`** — extend existing tests from "one late response" to "10 keystrokes in <1s typing." The orchestration's `requestId` flow should still drop all 9 stale responses correctly. If a race-window bug surfaces, fix it.

4. **`§10 — per-row request-id supersedure in useServerTreeGrid`** — `loadTreeChildren` doesn't currently call `abortExcept` the way paged does. Tree fetches under viewKey K1 can resolve and merge into a K2 snapshot. Either add per-row `abortExcept` (preferred) OR a viewKey gate at result-merge time. Pick the cleaner approach; document in JSDoc.

**Branch:** `agent/worker1/v05-server-perf-bundle-1`. **Effort:** ~30-40 min for the bundle.

### Earlier task superseded

The 3 remaining `useServerTreeGrid` polish items (`rootChildCount?`, `pageSize?`, `cacheLimit?`) were deferred to v0.6 in `v06-server-tree-grid-options` because they were "nice-to-have" rather than v0.5 release-gate. With your lane otherwise clean and bsncraft about to consume `useServerTreeGrid` for the customers grouping migration, **pull these forward into v0.5** — they're small + additive + bsncraft flagged them.

**Spec:**

1. **`rootChildCount?: number`** — saves a round-trip when the consumer already knows the root count (e.g. from a separate `SELECT COUNT(*)` query). When provided, skip the initial `loadChildren({ parentRowId: null, ... })` count fetch and use the supplied value to seed the orchestration. The first viewport-driven page fetch still runs.
2. **`pageSize?: number`** — promote the implicit child page size to an explicit hook option. Default 100. Forwards into the orchestration's per-page request shape.
3. **`cacheLimit?: number`** — LRU cap on expanded-group caches for memory hygiene with deep trees. Default sensible (e.g. 64 expanded groups). When the user expands a 65th group, evict the LRU.

Match `useBcGridState`'s naming patterns; document each option in `api.md` and `useServerTreeGrid` JSDoc; add unit tests for each.

**Branch:** `agent/worker1/v05-server-tree-grid-options-pull-forward`. **Effort:** ~half day.

### Earlier active task superseded

Your v0.5 server-hook lane is essentially complete (server-hook trio + scrollToCell + groupRowId/persistTo polish all shipped; generic-`TRow` deferred to v0.6 with documented rationale; rest of the polish options `rootChildCount` / `pageSize` / `cacheLimit` queued in v0.6 backlog). The remaining v0.5 release-gate items for your involvement are bsncraft migration co-pilot (waits on the bsncraft team drafting their customers migration) and the alpha cut (coordinator-owned).

While the bsncraft draft is in flight, do a focused planning pass on **audit P1 server-perf items you flagged in your own #360 findings doc**. Convert anything that's still relevant against the now-shipped `useServerPagedGrid` / `useServerInfiniteGrid` / `useServerTreeGrid` into concrete v0.6 task entries. Expected items based on `audit-2026-05/worker1-findings.md`:

- Block-cache LRU eviction policy tuning under realistic ERP scroll patterns
- Prefetch-ahead budget calibration for `useServerInfiniteGrid` (default vs per-grid override)
- Stale-response handling guarantees once `requestId` floods (high-frequency filter typing)
- Per-row request-id supersedure correctness for `useServerTreeGrid` (children of row A vs row B)
- Optimistic-edit rollback semantics under concurrent server invalidations

**Branch:** `agent/worker1/v05-server-perf-audit-followups`. **Effort:** ~half day. **Output:** read-only doc at `docs/coordination/v05-audit-followups/worker1-server-perf.md` with concrete v0.6 task proposals (one per item: where it manifests, what's wrong, suggested fix shape, affected packages). No source changes — this is planning, not implementation. Worker rule unchanged: don't run Playwright / smoke-perf / perf benchmarks; the doc reasons about behavior from code + existing tests.

### After this → bsncraft migration co-pilot (when bsncraft team drafts)

The bsncraft team owns the actual customers migration code (~325 LOC `ServerEditGrid` wrapper → thin `<BcServerGrid>` adapter). When their draft PR opens, your role is server-grid expertise + reviewing the bc-grid-side rough edges. Walk through any "this is awkward" moment they hit — those become v0.6 inputs.

### After bsncraft migration → v0.6 server-perf implementation

The follow-up doc above will become the worker1 lane's v0.6 plan. Don't start v0.6 implementation work until v0.5 ships.

### After stretch → bsncraft migration proof (coordinator-led)

The coordinator owns the bsncraft migration proof but server-grid expertise is yours. With the architecture decision now clear (master tables → `<BcServerGrid>`), the migration is more substantive than first scoped — bsncraft's `ServerEditGrid` wrapper (~325 LOC, mostly duplicating `useServerPagedGrid`'s orchestration) gets replaced with a thin `<BcServerGrid>` adapter, and that pattern propagates to every bsncraft master table.

Pair with coordinator on:
- Migrating `~/work/bsncraft/apps/web/components/server-edit-grid.tsx` to a thin `<BcServerGrid>` wrapper.
- `loadCustomerRows` adapts to `LoadServerPage` (query shape: `{ view: { sort, filter, searchText, groupBy, visibleColumns }, pageIndex, pageSize, requestId }` → `{ rows, totalRows, pageIndex, pageSize }`).
- For grouped view: hook swap to `useServerTreeGrid` + `LoadServerTreeChildren` based on whether a group column is selected.
- Target diff: substantial wrapper deletion (the bsncraft team estimates the wrapper "largely deletes").
- Walk through any rough edges that surface — those become v0.6 inputs (and may include the deferred `groupRowId` / `persistTo` polish on `useServerTreeGrid` queued in v0.6 follow-ups).

The bsncraft team owns the actual migration code; your role is server-grid expertise + reviewing the bc-grid-side rough edges.

### Earlier follow-up tasks superseded (server-hook trio complete)

Same orchestration shape as `useServerPagedGrid` and `useServerInfiniteGrid`, adapted for `LoadServerTreeChildren`. Reuses the `internal/useServerOrchestration.ts` primitives you extracted in #368. **Recommendation: branch from `agent/worker1/v05-use-server-infinite-grid`** (your #368 branch) so you get the orchestration extraction without waiting for #368 to merge — coordinator will sort the merge order.

**Spec:**
```ts
export function useServerTreeGrid<TRow>(opts: {
  gridId: string
  loadChildren: LoadServerTreeChildren<TRow>
  rowId: (row: TRow) => RowId
  initialExpansion?: ReadonlySet<RowId>
}): {
  props: BcServerGridProps<TRow>      // spread-ready, rowModel="tree"
  state: ServerTreeState<TRow>        // expansion map, loading set, error
  actions: { reload, expandRow, collapseRow, applyOptimisticEdit }
}
```

**The hook owns:**
- Lazy-children fetching when a row's expansion state flips
- Per-row request-id flow (children of row A don't cancel children of row B)
- Stale-response rejection per row
- Recursive optimistic edit / rollback (parent + descendants)
- AbortSignal threading

**Reference:** `useServerPagedGrid` + `useServerInfiniteGrid` are templates. The hook should compose `useServerOrchestration` (single-stream request management) or extend it for the per-row case if needed.

**Tests:** unit-level for expansion → lazy fetch flow, per-row request-id supersedure (expand row A, expand row B, collapse row A, fetch row B should still complete), optimistic edit on a deeply nested child.

**Branch:** `agent/worker1/v05-use-server-tree-grid`. **Effort:** ~half day.

### Follow-up tasks (after `useServerTreeGrid` PR is open)

1. **Stretch: Generic `TRow` propagation** into `LoadServerPage<TRow>` / `LoadServerBlock<TRow>` / `LoadServerTreeChildren<TRow>` query types so `query.sort` / `query.filter` are typed against column ids (audit P1-C2). Branch: `agent/worker1/v05-server-loader-generics`. Only ship if low risk; defer to v0.6 if it churns the public type surface.
2. **Help on bsncraft migration proof** — bsncraft's `ServerEditGrid` wrapper (`~/work/bsncraft/apps/web/components/server-edit-grid.tsx:74-163`) is the textbook customer for `useServerPagedGrid`. Coordinator owns the migration but you'd be the natural co-owner since you wrote the hook. Branch: `coordinator/bsncraft-migration-proof` (joint coordinator + worker1).
3. **Audit P1 server-perf items.** Your audit findings doc (#360) flagged a few server-perf items (cache eviction tuning, prefetch budget calibration). Convert anything that's still relevant against the now-shipped `useServerPagedGrid` / `useServerInfiniteGrid` into v0.6 tasks. Branch: `agent/worker1/v05-server-perf-audit-followups` (read-only audit-style PR; produce a follow-up tasks doc rather than implementation).

### Primary task — `useServerPagedGrid({ gridId, loadPage })`

Audit P0-6 / synthesis sprint plan. The single biggest API ergonomics win for the BusinessCraft ERP migration.

**Spec:**
```ts
export function useServerPagedGrid<TRow>(opts: {
  gridId: string
  loadPage: LoadServerPage<TRow>
  initial?: { sort?, filter?, search?, page?, pageSize? }
  debounceMs?: number  // default 200ms for filter/search
  rowId: (row: TRow) => RowId
}): {
  props: BcServerGridProps<TRow>      // spread-ready into <BcServerGrid>
  state: ServerPagedState<TRow>       // current sort/filter/page/loading
  actions: { reload, setPage, setPageSize, applyOptimisticEdit }
}
```

**The hook owns:**
- `requestId` flow (each loadPage call gets an incrementing id; only the latest result is applied)
- Stale-response rejection (responses for a superseded requestId drop silently)
- Debounce on filter/search changes (default 200ms; configurable via `debounceMs`)
- Page reset on filter / sort / search change (back to page 0)
- Optimistic edits in flight (consumer calls `actions.applyOptimisticEdit({ rowId, patch })`; hook tracks until next loadPage settles or rejects)
- Error surface (`state.error` carries last loadPage error; `actions.reload()` retries)
- AbortSignal threading (uses the existing `ServerLoadContext.signal`)

**Reference implementation:** `~/work/bsncraft/apps/web/components/server-edit-grid.tsx:74-163`. That's the 9-`useState` orchestration this hook subsumes. Read it first; the hook should make all of that disappear in the consumer.

**Tests:** unit-level for the orchestration (request-id supersedure, debounce timing, page reset semantics, optimistic edit lifecycle). Don't write Playwright — coordinator runs that.

**Branch:** `agent/worker1/v05-use-server-paged-grid`

### Follow-up tasks (after the hook PR is open)

1. **`apiRef.scrollToCell(rowId, colId, opts)`** for server-paged grids. Returns a Promise that resolves once the cell is loaded + visible (handles the "row not yet loaded" case via the hook's loadPage). Branch: `agent/worker1/v05-api-ref-scroll-to-cell`.
2. **Companion hooks** if scope permits: `useServerInfiniteGrid`, `useServerTreeGrid`. Defer to v0.6 if tight.
3. **Stretch: Generic `TRow` propagation** into `LoadServerPage<TRow>` query type so `query.sort` / `query.filter` are typed against column ids. Branch: `agent/worker1/v05-server-loader-generics`. Only ship if low risk.

### Coordinator answers / context

- **PR #353 status:** approved; coordinator merging this turn after baseline bump. You don't need to do anything for it. The `rowProcessingMode="manual"` you added is exactly what `useServerPagedGrid` will rely on internally — your prior PR set up the foundation for this hook.
- **Cross-worker contract for `apiRef`:** worker3 owns editor-side methods (`focusCell`, `startEdit`, `commitEdit`, `cancelEdit`, `getActiveCell`); you own server-side (`scrollToCell`); worker2 owns filter-side (`openFilter`, `closeFilter`). Coordinate via the public `BcGridApi` type — no shared internal state.

### Rules reminder

- Don't run Playwright / smoke-perf / perf / broad benchmarks.
- Open PR; do not merge your own.
- Update `docs/queue.md` `[draft]` → `[in-flight: worker1]` → `[review: worker1 #PR]` at state transitions.

---

## Standing lane scope

Server-backed grid stability and v0.4 server edit contracts. Specifically:

- `packages/server-row-model/`
- `packages/react/` server-grid bindings (server grid component, server row caching, optimistic edit flow)
- Perf posture (virtualizer steady-state under churn)

You do **NOT** own: editors, filters, aggregations, theming, chrome polish. Don't refactor adjacent code while you're here.

## Worker rules (recap — full rules in `docs/AGENTS.md`)

- Branch off `main`. Never commit to `main`.
- Branch name: `agent/worker1/<task-slug>`.
- Run `bun run type-check`, `bun run lint`, focused unit tests.
- Do **NOT** run Playwright, smoke-perf, perf, or broad benchmarks. Coordinator owns those.
- Open PR against `main`. Do not merge your own PR.
- Update `docs/queue.md` at state transitions.

## Recent activity baseline

- v0.3.0 shipped (88398c6).
- Server grid hardening already on main: PR #343 (paged edit contracts), PR #327 (flicker boundary), PR #344 (server row query contracts).
- v0.4 chrome polish from #349 is the current visible UI baseline.

## When you finish the active task

1. Push the findings doc as a PR (single doc, no source changes).
2. Comment on the PR tagging the coordinator.
3. Wait for the next handoff update before starting new work.
