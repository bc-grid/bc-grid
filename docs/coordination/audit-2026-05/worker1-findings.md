# Worker1 Findings — bc-grid Audit 2026-05

**Author:** worker1 (Claude in `~/work/bcg-worker1`)
**Lane:** Server grid + perf posture (`@bc-grid/server-row-model`, `<BcServerGrid>` and related, virtualizer integration surface)
**Date:** 2026-05-02

## Executive summary

A 50,000-row paged ERP grid would feel **boring/instant under steady-state churn** — the pure server-row-model engine, blockKey-based stale-response dedup, LRU cache, and `rowProcessingMode="manual"` contract (PR #353) are genuinely well-built, and the bench gates (≥58 FPS at 100k×30, sort/filter <100ms on 100k rows, 100k-row cache prime <3 s with ≥99 % hot-cache hit rate) hold today. The engineering foundation here is the strongest part of the codebase. Two real product-fit gaps stop this from being shippable for BusinessCraft as-is: **(1)** server load failures render a silent text overlay with no retry path, which is unsafe on enterprise VPN/wifi conditions where transient failures are routine; **(2)** every server-side view change (filter / sort / groupBy / search) resets the page to 0 in chrome but leaves scroll, selection, and focus state stranded on the previous page's row IDs. Everything else is P2 polish or wait-for-1.0.

## P0 findings

### P0-W1-1 — Silent error overlay; no retry, no banner, no actionable recovery

- **Where:** `packages/react/src/serverGrid.tsx:439-447` (loading-overlay assembly), `packages/react/src/grid.tsx:2381-2391` (overlay render).
- **What:** When `paged.error` / `infinite.error` / `tree.error` is non-null, `<BcServerGrid>` puts the literal string `"Failed to load rows"` into the same `loadingOverlay` slot used for the spinner. The grid renders it inside `<div class="bc-grid-overlay" role="status">` — same chrome as the loading state, no retry button, no banner, no inline message, no distinction between "still loading" and "failed". The model's per-block retry helpers (`retryBlock`, `refresh({ purge: true })`) are reachable via `apiRef`, but nothing in the default UI surfaces them. Consumers must build their own retry chrome from scratch every time. PR #316 (closed at the reset) had a typed `serverStatusOverlay` hook and tokenized restrained retry surface that addressed this; the work was never re-landed.
- **Why it matters for the BusinessCraft ERP:** Every BC user is on enterprise wifi or VPN — transient `loadPage` failures are routine, not edge cases. The current behavior on a sales-estimating screen is: user filters to "open quotes for region NSW", server hiccups, screen says "Failed to load rows" with no button, user reloads the browser tab and loses context (filter, scroll, selection, in-flight edits). Document-management workflows with optimistic mutations on top of a load that then errors are even more confusing — the mutation overlay sits over a broken page. This is the single largest single-error surface that will shape the ERP user's trust in the tool on day one.
- **Recommendation:** Re-land PR #316 substantively: a typed `serverStatusOverlay` hook with `loading | error | empty` states, a default "Failed to load rows. **Retry**" button wired to `retryBlock` (infinite/tree) or `refresh({ purge: false })` (paged), tokenized via `--bc-grid-status-error` so consumers can theme it. Keep the existing `loadingOverlay` prop as the full-override escape hatch. The handoff says this is hedged on "fitting the coordinator's loading-overlay polish" — now that PR #349 has shipped that polish, the dependency is unblocked.

## P1 findings

### P1-W1-1 — Server view change resets page to 0 but leaves scroll, selection, and focus stranded

- **Where:** `packages/react/src/serverGrid.tsx:514-634` (handleSortChange / handleFilterChange / handleSearchTextChange / handleGroupByChange / handleColumnStateChange all funnel into `resetUncontrolledPage()` / `resetRows()`); no scroll/selection/focus reset anywhere in `serverGrid.tsx` or `grid.tsx` (verified by grep — zero matches for `scrollToTop`, `clearSelection`, focus-reset on view change).
- **What:** When the user is scrolled mid-list on page 7 and changes a filter, the page index correctly resets to 0 and a fresh `loadPage` fires for the new query. But the scroll position stays where it was, so the user lands inside the new page-0 instead of at the top. Selection state still holds row IDs from the prior view that may not exist in the new view (ghost selection). Active cell focus may refer to a row that's no longer rendered. NetSuite, Salesforce LWC datatable, and Excel tables all reset scroll-to-top on view-defining changes; bc-grid does not.
- **Why it matters for the BusinessCraft ERP:** Production-estimating workflows where the user filters down POs by vendor, then runs a "select all visible → bulk action" gesture, can fire the bulk action against ghost row IDs from the unfiltered view. Sales-estimating users who change the sort on a 50-row line-item grid expect to see the new top, not row 30 of the new sort. This is small per incident but happens on every filter/sort interaction.
- **Recommendation:** On view-key change in `<BcServerGrid>`: (a) call `apiRef.current?.scrollToRow(0)` to reset scroll; (b) intersect current selection with the rows the new query returns once it resolves, dropping any ghost IDs; (c) clear active cell focus when its row ID is no longer in the visible rows. Make all three behaviors opt-out, not opt-in (`preserveScrollOnViewChange`, `preserveSelectionOnViewChange`, `preserveFocusOnViewChange` props defaulting to `false`).

### P1-W1-2 — Per-cell `getCellValue` + `formatCellValue` + search highlighting runs on every grid render with no per-cell memoization

- **Where:** `packages/react/src/bodyCells.tsx:91-256` (`renderBodyCell` is a plain function, not `React.memo`'d, called from `packages/react/src/grid.tsx` per visible cell per render); cost surfaces as `getCellValue` (`packages/react/src/value.ts`) + `formatCellValue` + `splitSearchText`/`highlightSearchText` (`bodyCells.tsx:344-368`) running per cell.
- **What:** With the virtualizer rendering ~30-50 visible rows × ~10-30 visible columns, that's 300-1500 cell-function invocations per grid render. The grid's outer state (sort, filter, hover, focus, scroll, selection) all trigger a parent re-render, so all visible cells re-compute even though their `entry.row` and `column.source` haven't changed. The current 100k×30 scroll-FPS bench (≥58 FPS) passes today, so this is not actively broken — but it leaves no headroom for sales-estimating's formula columns (`extended_price = qty × unit_price` recomputed on commit) or document-management's per-cell thumbnail mounts. Any added per-cell work will eat into the 16 ms frame budget under churn.
- **Why it matters for the BusinessCraft ERP:** Sales-estimating with 80 line items and dependent cells (qty × price → extended price recalculates on commit) is the hero use case the audit specifically calls out as "sensitive to subtle controlled-state bugs and perf cost." Document-management with a thumbnail column will compound this: each thumbnail render is non-trivial. Without per-cell memoization, both hero grids will pay the full re-render tax on every interaction.
- **Recommendation:** Wrap the cell render in a `React.memo`-equivalent: extract a `<BodyCell />` component memo'd on `(entry.rowId, column.columnId, value, formattedValue, searchText, selected, focused, editingCell, rowEditState)`. Don't memoize on the column object itself — it's recreated by `consumerResolvedColumns`. Add a paged-mode benchmark at 50k×30 with active sort, filter, and a 1Hz scroll churn to catch regressions.

### P1-W1-3 — Failed infinite/tree blocks stay in `state: "error"` indefinitely with no automatic retry and no visible cell affordance

- **Where:** `packages/server-row-model/src/index.ts` block-state machine; `packages/react/src/grid.tsx` body cell render (no error-state branch for "block failed to load").
- **What:** When `loadBlock` rejects, the block transitions to `state: "error"` and stays there until the user re-scrolls the block into view (which retries) or the consumer calls `apiRef.current?.retryServerBlock(blockKey)`. Cells inside an errored block render empty — same as cells in not-yet-loaded blocks — so the user can't tell a block failed vs. is still loading. There's no per-block retry chrome, no "loading dot in row gutter," no inline error marker.
- **Why it matters for the BusinessCraft ERP:** Document-management browsing a 100k-document tree on a flaky VPN will silently swallow some blocks on first load. The user scrolls past the gap, comes back, and rows are still empty — they have no way to know why or how to fix it. Production-estimating tree views (parent PO with child line items) hit the same pattern.
- **Recommendation:** Add a per-block status surface. Minimum: a row-gutter affordance (single dot or small icon) that shows `loading | error | retrying`, and an `onBlockError` callback so consumers can surface a toast / retry. Optional but cheap: auto-retry transient errors with a small backoff (1-3 attempts) before marking the block permanently failed.

### P1-W1-4 — `resolveServerVisibleColumns` returns columnIds in source order, not the user's reorder order

- **Where:** `packages/react/src/serverGrid.tsx:198-209` (`resolveServerVisibleColumns`); contract test at `packages/react/tests/serverGridPaged.test.ts:816-871`.
- **What:** When the user reorders columns via drag-and-drop, the column-state entries record the new positions. `resolveServerVisibleColumns` walks the **source columns** array and filters out hidden ones — it never reads `columnState[i].position`. So `view.visibleColumns` arrives at the server as the original column order. For a server that uses `visibleColumns` for query optimization (only fetch needed fields), this is fine. For a server that uses it to drive CSV export column order, it's wrong. The contract test pins source-order behavior but doesn't assert reorder-aware behavior.
- **Why it matters for the BusinessCraft ERP:** "Export visible to Excel" is a near-universal ERP affordance. If the consumer wires the export endpoint to `view.visibleColumns`, the exported CSV will not match what the user sees in the grid. Lower urgency than P1-W1-1/2/3 because few consumers wire this up today, but it's a foot-gun waiting for the first BC user who reorders columns and hits "Export."
- **Recommendation:** Document explicitly that `view.visibleColumns` is source-order, not display-order. Add a separate helper `resolveServerDisplayColumns(columns, columnState)` that returns visibility-filtered IDs in display order, and pass both to the server query: `view.visibleColumns` (set semantics) and `view.displayColumnOrder` (sequence semantics).

## P2 findings

### P2-W1-1 — Default cache eviction `maxBlocks: 20` is conservative for long infinite-scroll sessions

- **Where:** `packages/server-row-model/src/index.ts:284` (`DEFAULT_BLOCK_CACHE_OPTIONS = { maxBlocks: 20 }`).
- **What:** With `blockSize: 100` (default), 20 blocks = 2,000 rows in cache. A user scrolling through a 100k-row dataset will continuously evict and refetch as they move. The 100k bench uses `maxBlocks: 1000` to get 99 % hit rate; the default would be far lower under the same workload.
- **Recommendation:** Bump default to 50 blocks (5,000 rows). Document the trade-off in the server-edit-grid contract.

### P2-W1-2 — No paged-mode or optimistic-mutation benchmark

- **Where:** `apps/benchmarks/tests/perf.perf.pw.ts`. Existing benches: scroll-FPS, sort/filter latency, memory, infinite-mode cache hit rate. No paged-mode flicker bench, no mutation-queue overhead bench.
- **Recommendation:** Add a paged-mode bench: `loadPage(p, view) → 250ms simulated server`, change filter mid-scroll, verify no flicker (PR #353's contract) and ≥58 FPS through the change. Add a mutation bench: queue 100 optimistic edits, settle them at 10/sec, measure overlay overhead.

### P2-W1-3 — `AbortSignal` contract for consumer `loadPage` / `loadBlock` is not documented

- **Where:** `docs/design/server-edit-grid-contract.md` mentions the consumer "should pass through the provided `AbortSignal` to their fetch layer" once, but doesn't show the API shape on `LoadServerPage<TRow>` / `LoadServerBlock<TRow>` in the doc.
- **Recommendation:** Add a code snippet to the contract doc showing the signal arrives on `query.signal` and demonstrating the `fetch(url, { signal: query.signal })` pattern.

### P2-W1-4 — No server-side group row synthesis

- **Where:** Per-design — listed as Q2 / post-1.0 in `docs/api.md §5.3`.
- **What:** When the user enables grouping on a `<BcServerGrid>` and the server doesn't return group rows itself, bc-grid has no way to synthesize summary rows from the loaded page. The grouping discoverability docs (PR #341) name this explicitly. PR #353's manual-mode fix removed even the client-grouping-over-loaded-page fallback.
- **Recommendation:** Hold for v1.0. Note in the v0.5 plan that bsncraft grouping examples should run server-side from day one.

## What's already strong

- **BlockKey + `abortExcept` stale-response dedup is genuinely clean** (`packages/server-row-model/src/index.ts:919`). The contract is enforced at both the model layer and the React layer (`isActiveServerPagedResponse` at `serverGrid.tsx:191-195`). Late responses cannot ghost newer state. This is the single best-engineered subsystem in the codebase.
- **Pure `@bc-grid/server-row-model` engine is React-free, testable in isolation, and could be swapped for an alternative React or Solid binding.** 51 unit tests in `packages/server-row-model/tests/serverRowModel.test.ts` cover paged/infinite/tree, cache eviction, dedup, abort, mutation queue, identity remap, conflict-with-canonical-row, late-stale settle, and `cache.clear()` behavior across all three modes.
- **PR #353's `rowProcessingMode="manual"` is the architecturally correct fix for refresh flicker.** Chrome stays controlled, rows stay server-owned, FLIP disabled for server refreshes. The contract is one line in `serverGrid.tsx:457`, gated end-to-end at `grid.tsx:538-557` and `:1835-1840`.
- **Diagnostics surface (cache hit rate, fetch latency, queue wait, queued requests) is operationally useful** — exposed via `apiRef.current?.getServerDiagnostics()`. Few competing libraries surface this. Keep it; document it.

## Open questions for the coordinator

1. **P0-W1-1 ownership** — the handoff says "Add or refine server error/retry surfaces only if they fit the coordinator's loading/status polish." PR #349 has now shipped the loading polish. Is this back in worker1's lane, or do you want to own re-landing PR #316's typed `serverStatusOverlay` hook so it lines up visually with your overlay work?
2. **P1-W1-1 default policy** — should view-change reset scroll, selection, and focus by default (NetSuite/Salesforce convention) or preserve them by default (current bc-grid behavior)? My read is reset-by-default with opt-out props, but this changes existing consumer behavior.
3. **P1-W1-2 risk appetite** — the per-cell memoization fix is a non-trivial refactor in `bodyCells.tsx` and would need a bench update. Is this v0.5 work or v1.0 work? The current FPS bench passes, so it's not regressing today; the question is headroom for hero use cases.
4. **P1-W1-4 scope** — adding `view.displayColumnOrder` to the server query payload is a public-API change to `ServerViewState` (`packages/core/src/index.ts`). Worth the API churn now, or wait until a consumer asks?
