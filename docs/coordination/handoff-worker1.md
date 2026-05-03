# Worker1 Handoff (Claude — server grid stability lane)

**Last updated:** 2026-05-02 by Claude coordinator
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

### Active now → `v05-default-context-menu-wiring` — server + pagination slice (~1-1.5h)

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
