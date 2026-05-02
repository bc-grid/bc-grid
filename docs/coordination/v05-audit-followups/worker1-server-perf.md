# Worker1 v0.5 → v0.6 Server-Perf Follow-ups

**Author:** worker1 (Claude in `~/work/bcg-worker1`)
**Date:** 2026-05-03
**Lane:** server grid + perf posture (`@bc-grid/server-row-model`, `<BcServerGrid>` and the v0.5 hook trio)
**Branch:** `agent/worker1/v05-server-perf-audit-followups`
**Source audit:** `docs/coordination/audit-2026-05/worker1-findings.md` (#360)

This is a **read-only planning pass**, not implementation. Each item names the v0.6 task, where it manifests in code today, what's wrong, the suggested fix shape, and the affected packages. Items are ordered so the coordinator can copy them straight into the v0.6 backlog.

The v0.5 server-hook lane shipped what was on the audit's critical path: `useServerPagedGrid` (#363), `apiRef.scrollToServerCell` (#366), `useServerInfiniteGrid` + extracted shared orchestration primitives (#368), `useServerTreeGrid` (#371), and the `groupRowId` + `persistTo` polish (#379). Two stretch items deferred with rationale: generic `TRow` propagation (#376 design note — TS variance trap) and the audit P0-1 retry surface (queued separately as `v05-server-status-overlay`). What follows are the perf-shaped items the audit flagged that a now-shipped v0.5 surface still doesn't address.

## Status of #360 audit findings after v0.5

| #360 finding | Status after v0.5 | v0.6 task entry |
|---|---|---|
| **P0-W1-1** silent error overlay; no retry | Still open. Not shipped in v0.5. | `v06-server-status-overlay` (already queued separately by coordinator) |
| **P1-W1-1** view change strands scroll/selection/focus | Still open. Hooks own controlled state but don't reset scroll/selection/focus on view-key change. | **§1 below — `v06-server-view-change-reset-policy`** |
| **P1-W1-2** per-cell `formatCellValue` runs every render | Still open. `bodyCells.tsx:91` `renderBodyCell` is a plain function. | **§2 below — `v06-body-cell-memoisation`** |
| **P1-W1-3** failed infinite/tree blocks silent | Still open. `loadBlock` rejection → `state: "error"` with no per-block visual affordance and no auto-retry. | **§3 below — `v06-block-error-affordance`** |
| **P1-W1-4** `view.visibleColumns` source-order, not display-order | Still open. `resolveServerVisibleColumns` walks source columns. | **§4 below — `v06-server-display-column-order`** |
| **P2-W1-1** `maxBlocks: 20` default conservative | Still open. Default unchanged. | **§5 below — `v06-block-cache-default-tuning`** |
| **P2-W1-2** no paged-mode / mutation bench | Still open. `apps/benchmarks/tests/perf.perf.pw.ts` covers infinite-mode and scroll-FPS but not paged flicker or mutation overhead. | **§6 below — `v06-server-perf-bench-coverage`** |
| **P2-W1-3** `AbortSignal` contract under-documented | Still open. Brief mention in `server-edit-grid-contract.md`; no code snippet. | **§7 below — `v06-abort-signal-contract-docs`** |
| **P2-W1-4** no server-side group row synthesis | Hold for v1.0 (per-design). | not queued — v1.0 surface |

The handoff (`docs/coordination/handoff-worker1.md`) also explicitly named these to convert:

| Handoff item | Status | v0.6 task entry |
|---|---|---|
| Block-cache LRU eviction tuning under realistic ERP scroll | covers P2-W1-1 | §5 |
| Prefetch-ahead budget calibration for `useServerInfiniteGrid` | new | **§8 below — `v06-server-infinite-prefetch-budget`** |
| Stale-response handling under `requestId` floods | new | **§9 below — `v06-stale-response-flood-test`** |
| Per-row request-id supersedure for `useServerTreeGrid` | new | **§10 below — `v06-server-tree-stale-viewkey-fetches`** |
| Optimistic-edit rollback under concurrent invalidations | new | **§11 below — `v06-optimistic-rollback-vs-invalidate`** |

## v0.6 task proposals

### §1 — `v06-server-view-change-reset-policy`

- **Where:** `packages/react/src/serverGrid.tsx:514-634` (paged), `packages/react/src/useServerPagedGrid.ts:217-222` (hook page reset). No scroll/selection/focus reset anywhere — verified by grep for `scrollToTop`, `clearSelection`.
- **What's wrong:** Filter / sort / search / groupBy change resets the page to 0 in chrome, but scroll position, selection set, and active cell focus all persist. Selection holds rowIds from the prior view that may not exist in the new view (ghost selection). NetSuite, Salesforce LWC datatable, and Excel tables all reset scroll-to-top on view-defining changes.
- **Fix shape:** On viewKey change in `<BcServerGrid>`: (a) call `apiRef.current?.scrollToRow(0)` to reset scroll; (b) intersect current selection with the rows the new query returns once it resolves, dropping any ghost IDs; (c) clear active cell focus when its rowId is no longer in the visible rows. Three opt-out props default `false`: `preserveScrollOnViewChange`, `preserveSelectionOnViewChange`, `preserveFocusOnViewChange`.
- **Affected:** `@bc-grid/react` — `serverGrid.tsx`, `useServerPagedGrid.ts`, `useServerInfiniteGrid.ts`, `useServerTreeGrid.ts`, `BcServerGridProps` types, contract tests.
- **Decision needed:** reset-by-default vs preserve-by-default (changes existing consumer behavior). My read remains reset-by-default with opt-out. Open question from #360 still applies.

### §2 — `v06-body-cell-memoisation`

- **Where:** `packages/react/src/bodyCells.tsx:91` (`renderBodyCell` is a plain function, not memoized).
- **What's wrong:** Per visible cell × per render. With 30-50 visible rows × 10-30 visible columns, that's 300-1500 cell-function invocations per parent re-render. Sort, filter, hover, focus, scroll, and selection all trigger parent re-renders. The current 100k×30 scroll-FPS bench passes today (≥58 FPS) but leaves no headroom for sales-estimating's formula columns or document-management's per-cell thumbnails.
- **Fix shape:** Extract a `<BodyCell />` component memoized on `(entry.rowId, column.columnId, value, formattedValue, searchText, selected, focused, editingCell, rowEditState)`. Don't memoize on the column object — `consumerResolvedColumns` recreates it each render. Add a paged-mode benchmark at 50k×30 with active sort+filter+1Hz scroll churn to catch regressions.
- **Affected:** `@bc-grid/react` — `bodyCells.tsx`, `grid.tsx` cell-render call site, `apps/benchmarks/tests/perf.perf.pw.ts`. Coordinator-owned benchmark addition.
- **Risk note:** `React.memo` adds a small overhead per cell on the comparison side; the bench needs to confirm net win. Likely positive at 30+ visible columns but worth measuring before locking in.

### §3 — `v06-block-error-affordance`

- **Where:** `packages/server-row-model/src/index.ts` block-state machine; `packages/react/src/grid.tsx` body cell render path has no error-state branch for "this block failed to load."
- **What's wrong:** When `loadBlock` rejects, the block transitions to `state: "error"` and stays there until the user re-scrolls into view (which retries) or the consumer calls `apiRef.current?.retryServerBlock(blockKey)`. Cells in the errored block render empty — visually identical to not-yet-loaded blocks. Document-management browsing a 100k-document tree on a flaky VPN silently swallows blocks; user has no way to know why rows are blank.
- **Fix shape:** Add a per-block status surface. Minimum: a row-gutter affordance (single dot or small icon) showing `loading | error | retrying`, plus an `onBlockError` callback so consumers can surface a toast / retry. Optional but cheap: auto-retry transient errors with a small backoff (1-3 attempts) before marking the block permanently failed.
- **Affected:** `@bc-grid/react` (cell render + props), `@bc-grid/server-row-model` (auto-retry policy), theming tokens for the row-gutter affordance.

### §4 — `v06-server-display-column-order`

- **Where:** `packages/react/src/serverGrid.tsx:198-209` (`resolveServerVisibleColumns`); contract test at `packages/react/tests/serverGridPaged.test.ts:816-871`.
- **What's wrong:** When the user reorders columns via drag-and-drop, the column-state entries record new positions. `resolveServerVisibleColumns` walks the source columns array — never reads `columnState[i].position`. So `view.visibleColumns` arrives at the server in the original column order. For "export visible to Excel" workflows where the server uses `view.visibleColumns` to drive CSV column order, the export will not match what the user sees in the grid.
- **Fix shape:** Document explicitly that `view.visibleColumns` is source-order (set semantics). Add a separate helper `resolveServerDisplayColumns(columns, columnState)` that returns visibility-filtered IDs in display order, and pass both into the server query: `view.visibleColumns` (set) and `view.displayColumnOrder` (sequence).
- **Affected:** `@bc-grid/core` (`ServerViewState` shape — additive, but a public-API change), `@bc-grid/react` (`serverGrid.tsx` view assembly), docs, contract tests.
- **Decision needed:** add `displayColumnOrder` to `ServerViewState` now (additive, optional) or wait until a consumer asks. Open question from #360 still applies.

### §5 — `v06-block-cache-default-tuning`

- **Where:** `packages/server-row-model/src/index.ts:281-284` (`DEFAULT_BLOCK_CACHE_OPTIONS = { maxBlocks: 20 }`).
- **What's wrong:** With `blockSize: 100` (default), 20 blocks = 2,000 rows in cache. A user scrolling through a 100k-row dataset continuously evicts and refetches. The bench at `apps/benchmarks/tests/perf.perf.pw.ts:128` uses `maxBlocks: 1000` to hit ≥99 % hot-cache hit rate; the default would be dramatically lower under the same workload.
- **Fix shape:** Bump default to 50 blocks (5,000 rows). Document the trade-off — 50 blocks × ~100 bytes per row × 30 columns ≈ 150 KB peak retention per grid, comfortably under any sensible budget. Consumers wanting tighter or looser limits already have `maxCachedBlocks`.
- **Affected:** `@bc-grid/server-row-model` (one-line default change), `docs/design/server-edit-grid-contract.md` (document the trade-off), bench gate verification.

### §6 — `v06-server-perf-bench-coverage`

- **Where:** `apps/benchmarks/tests/perf.perf.pw.ts` covers scroll-FPS at 100k, sort/filter latency, memory, infinite-mode cache hit rate. Missing:
  - Paged-mode benchmark covering the v0.5 flicker contract (PR #353 `rowProcessingMode="manual"`).
  - Mutation queue overhead bench (queue 100 optimistic edits, settle at 10/sec, measure overlay overhead).
  - Tree-mode children fetch benchmark (deeply nested, expand-cascade workload).
- **Fix shape:** Three new bench cases — paged-flicker, mutation-overlay, tree-expand. Coordinator-owned (workers don't run bench). The cases mostly rewrite existing infinite-mode infrastructure; ~2-3 hours of bench-author time.
- **Affected:** `apps/benchmarks/tests/perf.perf.pw.ts` only.

### §7 — `v06-abort-signal-contract-docs`

- **Where:** `docs/design/server-edit-grid-contract.md` mentions the consumer "should pass through the provided `AbortSignal` to their fetch layer" once but doesn't show the API shape on `LoadServerPage<TRow>` / `LoadServerBlock<TRow>` / `LoadServerTreeChildren<TRow>` in the doc.
- **Fix shape:** Add a code snippet to the contract doc showing the signal arrives on `context.signal` (not `query.signal` — easy to confuse) and demonstrating the `fetch(url, { signal: context.signal })` pattern. Cross-reference the abort behavior at `packages/server-row-model/src/index.ts:919` (`abortExcept`).
- **Affected:** docs only. ~30 minutes.

### §8 — `v06-server-infinite-prefetch-budget`

- **Where:** `packages/react/src/serverGrid.tsx:1140-1146` and `:1163-1172` — both `loadOnFirstRender` and `handleVisibleRowRangeChange` hard-code "ensure current visible range + one block ahead at `range.endIndex + blockSize`."
- **What's wrong:** Prefetch is fixed at exactly one block ahead. A fast scroller hits the cliff every block; a slow scroller wastes bandwidth fetching ahead more than needed. The `useServerInfiniteGrid` spec mentioned `prefetchAhead?: number` but the hook intentionally doesn't expose it because there's no underlying knob to wire to.
- **Fix shape:** Add `prefetchAhead?: number` (default 1) to `BcServerInfiniteProps`. Wire through `<BcServerGrid rowModel="infinite">` to issue `ensureBlock(range.endIndex + blockSize * i)` for `i = 1..prefetchAhead`. Then expose the same option on `useServerInfiniteGrid`. For ERP workloads `prefetchAhead: 2` likely matches user scroll velocity better than 1.
- **Affected:** `@bc-grid/core` (`BcServerInfiniteProps` type — additive), `@bc-grid/react` (`serverGrid.tsx` infinite path + `useServerInfiniteGrid.ts` props passthrough), api-surface manifest, hook tests.

### §9 — `v06-stale-response-flood-test`

- **Where:** `packages/server-row-model/src/index.ts:919` (`abortExcept`); React-layer gate at `packages/react/src/serverGrid.tsx:790` (`isActiveServerPagedResponse`). Existing test coverage in `packages/react/tests/serverGridPaged.test.ts:374-688` ("server paged stale response ordering") covers a single late response — not a flood.
- **What's wrong:** No test exercises high-frequency filter typing (e.g. user types "abcdef" with 10 keystrokes in <1 s). Each keystroke advances the debounced filter, fires a new `loadPage`, and the prior request gets aborted via `abortExcept`. Under flood conditions the test doesn't verify: (a) every prior request is actually aborted (no zombie completions); (b) the model's `lastLoad` diagnostic ends pointing at the final request, not an intermediate one; (c) there are no race conditions where two intermediate responses both pass the `isActiveServerPagedResponse` gate against momentarily-current blockKeys.
- **Fix shape:** Add a model-layer test that fires 10+ paged requests in quick succession, deferring each `loadPage` resolution. Resolve them out of order and assert: (a) only the latest result lands in cache; (b) `lastLoad.status === "success"` for the latest; (c) all prior requests' `controller.signal.aborted === true`.
- **Affected:** `packages/server-row-model/tests/serverRowModel.test.ts` only. No source changes (existing behavior is correct based on code review; this is contract pinning).

### §10 — `v06-server-tree-stale-viewkey-fetches`

- **Where:** `packages/react/src/serverGrid.tsx:1323-1382` (`loadTreeChildren`). Note: `loadTreeChildren` does NOT call `abortExcept` — paged does (line 902), tree does not. Each tree fetch runs to completion independently.
- **What's wrong:** User expands row A under viewKey K1, fetch fires under K1. User changes filter — viewKey becomes K2. The K1 fetch is NOT aborted. When it eventually resolves, `mergeTreeResult` is called with `viewKey: result.viewKey ?? viewKey` where the closed-over `viewKey` is K2 (current) — potentially merging K1's children into a K2 snapshot. Concrete consequence: stale children appear under a node that may have re-collapsed or been filtered out, until the user manually re-expands and triggers a fresh K2 fetch.
- **Fix shape:** Either (a) call `abortExcept` against the latest tree-fetch blockKey on every new tree fetch (matches paged behavior — abort all-but-latest), or (b) gate the `request.promise.then((result) => …)` block on `viewKey === viewKeyRef.current` (matches the React-layer pattern from `isActiveServerPagedResponse`). Option (b) is the lower-risk minimum because aborting tree fetches affects multiple parent-row-id requests in flight in parallel.
- **Affected:** `@bc-grid/react` — `serverGrid.tsx` tree path. Pure-helper test covering the gate decision (mirror `isActiveServerPagedResponse` shape).

### §11 — `v06-optimistic-rollback-vs-invalidate`

- **Where:** `packages/server-row-model/src/index.ts:951-1064` (`invalidate`, `settleMutation`). Pending mutations live in `#pendingMutations` (line 606) and survive `invalidate({ scope: "rows" | "view" | "all" })` calls — which is correct behavior.
- **What's wrong (subtle):** When a consumer's `onServerRowMutation` is in-flight and an invalidation purges the affected row's cache, the next load returns the row without the optimistic patch applied (the patch is still pending so the model re-applies it). If the mutation later resolves with `status: "rejected"`, the rollback target is the post-invalidation row from the server — which may have other server-side changes that landed independently. The user sees a rollback that "looks wrong" because it discards both the failed edit AND any newer server changes from the invalidation cycle.
- **Fix shape:** On rejected settlement, decide between (a) snapshot-based rollback — capture the canonical row at queue time and restore it on rejection (today's behavior), or (b) re-fetch on rollback — when a rejection lands and the row has been invalidated since queue time, refetch the row instead of restoring an outdated snapshot. (b) is more correct but adds a server roundtrip per rollback. Document the trade-off and pick (b) for v0.6 if the bsncraft team confirms the UX matters; otherwise leave as (a) and document.
- **Affected:** `@bc-grid/server-row-model` — `settleMutation` + companion test cases. Decision needs bsncraft input on whether the "stale rollback" UX is acceptable.

## Ranking suggestion

If v0.6 capacity is tight, the priority order is:

1. **§3** (block-error affordance) — silent failures are a trust killer.
2. **§1** (view-change reset policy) — every filter/sort interaction.
3. **§2** (per-cell memoisation) — unblocks hero columns (formula, thumbnail).
4. **§5** (cache default tuning) — single-line change, immediate win.
5. **§10** (tree stale viewKey) — correctness gap, narrow blast radius.
6. **§8** (prefetch budget) — opt-in knob, low risk.
7. **§9** (flood test) — pure test addition, contract pinning.
8. **§11** (optimistic rollback) — needs bsncraft input first.
9. **§7** (AbortSignal docs) — 30-min docs win.
10. **§4** (display column order) — wait for first consumer.
11. **§6** (bench coverage) — coordinator-owned, parallel track.

## Open questions for the coordinator

1. **§1 default policy** — reset scroll/selection/focus on view-change as the default (NetSuite/Salesforce convention) or preserve as the default (current bc-grid)? My read is reset-by-default with opt-out. Same open question from #360 — still relevant.
2. **§2 risk appetite** — `<BodyCell />` memoisation is a non-trivial refactor in `bodyCells.tsx`; does the v0.6 capacity allow it before sales-estimating + document-management hero grids ship?
3. **§4 scope** — add `view.displayColumnOrder` to `ServerViewState` proactively (additive) or wait for a consumer ask?
4. **§10 fix choice** — abort-on-new-fetch (mirror paged) or React-layer viewKey gate (lower-risk)? The latter doesn't waste a network round-trip but leaves the abandoned fetch running.
5. **§11 fix choice** — snapshot-based rollback (today) or refetch-on-rollback (correctness with cost)? Needs bsncraft input.
