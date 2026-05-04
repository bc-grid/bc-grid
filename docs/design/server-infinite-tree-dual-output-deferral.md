# Server Infinite + Tree Dual-Output Deferral

**Status:** DEFERRED to v0.6.x. Documentation-only doc explaining why and how to unblock.

**Created:** 2026-05-04 by worker1 (Claude). Companion to:
- `docs/design/server-grid-hooks-dual-output-rfc.md` (parent RFC, ratified via #477)
- `#484` (paged dual-output IMPL, shipped)
- `docs/design/v05-server-loader-generics-deferral.md` (precedent for the deferral pattern)

---

## What was deferred

The dual-output RFC #477 ratified `bound` output for three hooks:

- `useServerPagedGrid` — ✅ **shipped #484**
- `useServerInfiniteGrid` — ⏳ **deferred (this doc)**
- `useServerTreeGrid` — ⏳ **deferred (this doc)**

## Why deferred

The `bound` output requires the hook to ORCHESTRATE the loader internally so `bound.data` is populated for consumers wrapping `<BcGrid>` (not `<BcServerGrid>`). For `useServerPagedGrid`, the orchestration is one `loadPage` call per view-defining state change — straightforward to write inline (~80 LOC, see #484).

For `useServerInfiniteGrid` and `useServerTreeGrid`, the orchestration is materially more complex:

| Concern | Paged | Infinite | Tree |
|---|---|---|---|
| Loader fires on | view change | viewport scroll → block boundaries | per-parentRowId expansion |
| State accumulator | latest page replaces | block-stitching via `mergeInfiniteRows` | recursive snapshot via `updateTreeNode` |
| Stale-response gate | requestId per fetch | requestId + viewKey + blockKey | requestId + viewKey + parentRowId |
| LRU eviction | n/a | `evictLoadedBlocks(maxCachedBlocks)` | `evictLoadedBlocks(maxCachedTreeBlocks)` |
| Visible-range API | n/a | `onVisibleRowRangeChange` from `<BcGrid>` | n/a (driven by expansion state) |
| LOC in serverGrid.tsx | ~400 | ~330 | ~430 |

The orchestration for infinite + tree currently lives in `useInfiniteServerState` and `useTreeServerState` inside `packages/react/src/serverGrid.tsx`. Adding `bound` to the turnkey hooks requires either:

**Option A — duplicate the orchestration in each turnkey hook.** ~800 LOC duplicated logic across two files. Drifts as the orchestration evolves; review burden doubles for every server-grid change. Rejected.

**Option B — extract `useInfiniteOrchestration` / `useTreeOrchestration` from `serverGrid.tsx` into shared primitives that BOTH `<BcServerGrid>` and the turnkey hooks call.** Per RFC §4 Option B (recommended). Requires:

1. Lift the per-mode state hooks from `serverGrid.tsx` (~830 LOC of dense React hook logic with refs, effects, model interactions).
2. Define stable input/output contracts so both `<BcServerGrid>` and the turnkey hook can call them.
3. Update `<BcServerGrid>` to call the extracted primitives (no behavior change for existing consumers — must verify).
4. Update each turnkey hook to call the extracted primitives + populate `bound`.
5. Marker-prop dedup (RFC §5) to prevent double-fetch when consumers mount BOTH `<BcServerGrid>` and read `bound` (acceptable to skip in first cut; document the "pick one output" trade-off as paged did in #484).

Estimated effort: ~1.5-2 days for infinite + tree combined. The lift is real but mechanical once the contract is right.

## Recommended path

Ship Option B as a single PR (or two PRs split by hook) when:

1. The paged dual-output (#484) has settled in alpha — bsncraft + 1+ other consumer adopt it and surface any surface-shape feedback.
2. The marker-prop dedup design is finalized (RFC §5 + §13 Q3). Consumer feedback on the "pick one output" trade-off in #484 will inform whether dedup is worth the complexity in v0.6.x or v0.7.

Until then, infinite + tree consumers wrapping `<BcGrid>` directly should:

1. Mount `<BcServerGrid>` for now (recommended path; `bound` is the escape hatch).
2. OR roll their own orchestration outside the hook (keeps the hook's controlled-state surface; loses the orchestration win — but matches today's API surface for these hooks).

## What ships in v0.6.0

- Paged: `bound` shipped (#484).
- Infinite + tree: `serverProps` (today's `props` field) only. `bound` field is NOT added to the hook return type yet — would create the half-finished surface AGENTS.md §3 forbids.

## How to unblock

When the v0.6.x impl PR opens, reference this doc + RFC #477. The `useInfiniteOrchestration` extraction signature should mirror this:

```ts
// New exports from packages/react/src/internal/serverModeOrchestration.ts
export function useInfiniteOrchestration<TRow>(input: {
  loadBlock: LoadServerBlock<TRow>
  view: ServerViewState
  viewKey: string
  blockSize?: number
  maxCachedBlocks?: number
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  prefetchAhead?: number
}): {
  rows: readonly TRow[]
  rowCount: number | "unknown"
  loading: boolean
  error: unknown
  handleVisibleRowRangeChange: (range: { startIndex: number; endIndex: number }) => void
  refresh: (opts?: { purge?: boolean }) => void
  invalidate: (invalidation: ServerInvalidation) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  apiRef: RefObject<BcServerGridApi<TRow> | null>
  // ...other state needed by `<BcServerGrid>`
}

export function useTreeOrchestration<TRow>(input: {
  loadChildren: LoadServerTreeChildren<TRow>
  loadRoots?: LoadServerTreeChildren<TRow>
  view: ServerViewState
  viewKey: string
  expansion: ReadonlySet<RowId>
  childCount?: number
  initialRootChildCount?: number
  maxCachedBlocks?: number
}): {
  rows: readonly TRow[]
  rowCount: number | "unknown"
  loading: boolean
  error: unknown
  serverRowEntryOverrides: ReadonlyMap<RowId, ServerRowEntryOverride>
  refresh: (opts?: { purge?: boolean }) => void
  invalidate: (invalidation: ServerInvalidation) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  apiRef: RefObject<BcServerGridApi<TRow> | null>
  // ...other state needed by `<BcServerGrid>`
}
```

Both `<BcServerGrid>`'s per-mode branches AND each turnkey hook's `bound` builder call these. Single source of truth for orchestration; no duplication.

## Open questions

1. Should the extraction live in `packages/react/src/internal/useServerOrchestration.ts` (existing file) or a new `serverModeOrchestration.ts`? RFC defers; pick whichever survives api-surface review.

2. The `apiRef` shape question (RFC §13 Q3) — when `bound` consumers mount `<BcGrid>` (not `<BcServerGrid>`), `apiRef.current` is `BcGridApi`, lacking `refreshServerRows` etc. The hook's `actions.reload()` must dispatch through the orchestration directly. Pattern: have the orchestration hook return `actions` that close over its internal state, not over `apiRef.current`.

3. Should the marker-prop dedup (RFC §5) ship in the same PR as the orchestration extraction, or in a separate v0.6.x follow-up after consumer feedback? RFC defers; recommend separate PR — extraction alone unblocks bound output, and the dedup concerns are independent.

## Decision log

(empty — populated when the v0.6.x impl PR opens.)
