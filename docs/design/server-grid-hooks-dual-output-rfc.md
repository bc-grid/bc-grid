# Server-Grid Hooks Dual-Output RFC

**Status:** Draft for ratification (autonomous merge authorised; doc-only RFC, implementation follows after maintainer answers §13)
**Author:** worker1 (Claude)
**Reviewer:** maintainer (JohnC) + Claude coordinator
**Target release:** v0.6.0
**Implementation lane:** worker1 (single PR after ratification, ~1 day)
**Informed by:** `docs/coordination/handoff-worker1.md` 2026-05-04 refresh (bsncraft P1 #14), `docs/coordination/bsncraft-issues.md` consumer report, `packages/react/src/useServerTreeGrid.ts` / `useServerPagedGrid.ts` / `useServerInfiniteGrid.ts` (current single-output shape), `packages/react/src/serverGrid.tsx` per-mode `useXxxServerState` orchestration, `packages/react/src/internal/useServerOrchestration.ts` (existing shared primitives).

---

## 1. Problem statement

Bsncraft consumer report: `useServerTreeGrid` returns

```ts
{ props: BcServerTreeProps<TRow>, state, actions }
```

The `props` field is `BcServerGridProps`-shaped — every consumer who uses the hook MUST mount `<BcServerGrid rowModel="tree">` to consume it. Bsncraft wraps `<BcGrid>` directly (their own grid wrapper around the lower-level component), so they can't adopt the hook without restructuring their wrapper. Same gap exists for `useServerPagedGrid` and `useServerInfiniteGrid`.

Consumer-side workaround today: rebuild the orchestration in their wrapper (~250-400 LOC of `useState` + `useEffect` per grid kind). The whole point of the turnkey hooks (introduced in #363/#368/#371) is to eliminate this boilerplate. The current single-output limits the ergonomic win to consumers who use the bc-grid component layer directly.

The fix: each turnkey hook should produce TWO outputs that share the same internal orchestration:

1. **`serverProps`** — `BcServerGridProps`-shaped (today's `props`). Mount path: `<BcServerGrid {...result.serverProps} columns={…} />`.
2. **`bound`** — `BcGridProps`-shaped (the new path). Mount path: `<BcGrid {...result.bound} columns={…} />`.

Both must be cheap (no double-orchestration), type-safe (no `any` leakage), and observable through the same `state` + `actions` surface.

## 2. Scope and non-goals

**In scope (v0.6.0):**

- Three hooks gain `bound` output: `useServerTreeGrid`, `useServerPagedGrid`, `useServerInfiniteGrid`.
- The polymorphic `useServerGrid` (#409) gains `bound` output as a single union shape (the `bound` shape itself is invariant across modes; only the underlying state machine differs).
- Same `state` + `actions` shape regardless of which output the consumer uses.
- Recipe at `docs/recipes/server-grid-without-bcservergrid.md` showing the `bound` path with bsncraft-style wrapper consumers as the worked example.
- Internal orchestration consolidation: lift the per-mode `useXxxServerState` from `serverGrid.tsx` into the hook layer so both outputs share one model instance.

**Out of scope (deferred):**

- **Removing `<BcServerGrid>`** as a component. The component stays as the recommended turnkey path; `bound` is the escape hatch for consumers who own their own wrapper.
- **`useServerPagedGrid` cursor variant** (`loadPageCursor`). Will land alongside the cursor pagination implementation per `docs/design/server-paged-cursor-pagination-rfc.md` once that RFC ratifies — `bound` shape is identical for offset and cursor paths.
- **`bound` shape for `useServerGrid` polymorphic hook** with mode-specific extras. The `bound` shape stays invariant across paged/infinite/tree modes — mode-specific props (e.g. `expansion` for tree, `pagination` for paged) appear conditionally based on the active loader.
- **Consumer-supplied `<BcGrid>` plumbing for chrome** (saved-views toolbar, context menu, status bar). Those compose normally with `bound` output via their existing `BcGridProps` slots; `bound` doesn't need to thread chrome state.

## 3. Public API surface

### 3.1 New `bound` output shape per hook

Each hook gains a third return field:

```ts
interface UseServerTreeGridResult<TRow> {
  serverProps: BcServerTreeBoundProps<TRow> // renamed from `props`
  bound: BcGridBoundProps<TRow>             // NEW
  state: UseServerTreeGridState
  actions: UseServerTreeGridActions
}

interface UseServerPagedGridResult<TRow> {
  serverProps: BcServerPagedBoundProps<TRow>
  bound: BcGridBoundProps<TRow>             // NEW
  state: UseServerPagedGridState
  actions: UseServerPagedGridActions
}

interface UseServerInfiniteGridResult<TRow> {
  serverProps: BcServerInfiniteBoundProps<TRow>
  bound: BcGridBoundProps<TRow>             // NEW
  state: UseServerInfiniteGridState
  actions: UseServerInfiniteGridActions
}
```

`props` is **renamed** to `serverProps` for clarity and to disambiguate from `bound`. Backwards compatibility: keep `props` as a deprecated alias that points at `serverProps`. Removed in v0.7.

### 3.2 `BcGridBoundProps<TRow>` shape

```ts
interface BcGridBoundProps<TRow> {
  // Identity (forwarded from hook opts)
  apiRef: RefObject<BcGridApi<TRow> | null>
  rowId: BcRowId<TRow>

  // Data + state — server-controlled
  data: readonly TRow[]
  loading: boolean
  errorOverlay: ReactNode | undefined
  rowProcessingMode: "manual"

  // Controlled view state — server-routed (the consumer's onChange
  // dispatches into the hook's controlled state, which triggers the
  // next fetch)
  sort: readonly BcGridSort[]
  onSortChange: (next: readonly BcGridSort[]) => void
  filter: BcGridFilter | null
  onFilterChange: (next: BcGridFilter | null) => void
  searchText: string
  onSearchTextChange: (next: string) => void

  // Mode-conditional fields
  // - paged: pagination + onPaginationChange
  // - tree: expansion + onExpansionChange + groupBy + onGroupByChange
  // - infinite: onVisibleRowRangeChange (no pagination/expansion/groupBy)
  pagination?: BcPaginationState
  onPaginationChange?: (next: BcPaginationState) => void
  expansion?: ReadonlySet<RowId>
  onExpansionChange?: (next: ReadonlySet<RowId>) => void
  groupBy?: readonly ColumnId[]
  onGroupByChange?: (next: readonly ColumnId[]) => void
  onVisibleRowRangeChange?: (range: { startIndex: number; endIndex: number }) => void
}
```

The `bound` output drops every `<BcServerGrid>`-specific field (`loadPage` / `loadBlock` / `loadChildren`, `rowModel`, `pageSize`, `blockSize`, `prefetchAhead`, `maxCachedBlocks`, `initialRootChildCount`, `loadRoots`, `childCount`). Those are encapsulated inside the hook — the consumer's `<BcGrid>` doesn't see them.

The mode-conditional fields are present on the type (TS optional) but only set by the hook for the relevant mode. Spreading `...result.bound` into `<BcGrid>` is the consumer pattern.

### 3.3 Mount usage example

**Tree mode, bsncraft-style wrapper:**

```tsx
function MyCustomerTreeGrid({ columns }: { columns: BcGridColumn<Customer>[] }) {
  const grid = useServerTreeGrid<Customer>({
    gridId: "customers",
    rowId: (row) => row.id,
    loadChildren: loadCustomerChildren,
  })
  return (
    <MyCustomGridChrome>
      <BcGrid<Customer> {...grid.bound} columns={columns} />
    </MyCustomGridChrome>
  )
}
```

**Paged mode, drop-in `<BcServerGrid>`:**

```tsx
function MyCustomerPagedGrid() {
  const grid = useServerPagedGrid<Customer>({
    gridId: "customers",
    rowId: (row) => row.id,
    loadPage: loadCustomerPage,
  })
  return <BcServerGrid<Customer> {...grid.serverProps} columns={customerColumns} />
}
```

Both call sites share the same hook + same orchestration internally.

## 4. Internal orchestration consolidation

Today's architecture:

- `useServerTreeGrid` (in `useServerTreeGrid.ts`) — wraps the consumer's `loadChildren`, manages controlled state, exposes `props: BcServerTreeProps`.
- `<BcServerGrid rowModel="tree">` (in `serverGrid.tsx`) — calls `useTreeServerState` which spins up its OWN model instance, dispatches fetches against the consumer's loaders, accumulates rows.

When a consumer uses `useServerTreeGrid + <BcServerGrid>`, BOTH fire. The hook's wrappers track loading/error UI; the inner state hook does the actual model work. There's deliberate duplication today (the hook is currently a thin wrapper that produces props; the heavy lifting is `<BcServerGrid>`'s).

For `bound` output to work, the hook must own the orchestration directly (because the consumer mounts plain `<BcGrid>`, not `<BcServerGrid>`). Two design paths:

### Option A — Hook owns the orchestration; `<BcServerGrid>` becomes a thin pass-through

Lift `useTreeServerState` / `usePagedServerState` / `useInfiniteServerState` from `serverGrid.tsx` into the corresponding turnkey hooks. `<BcServerGrid>` detects whether the consumer pre-orchestrated (by checking a marker in `serverProps`) and skips the inner orchestration if so.

- **Pros:** single orchestration path. No double-fetch.
- **Cons:** breaking change to the internal `useXxxServerState` boundary; `<BcServerGrid>` consumers who DON'T use the turnkey hook still need orchestration, so the per-mode state hooks have to stay accessible.

### Option B — Both `<BcServerGrid>` and the turnkey hook call a shared orchestration primitive (RECOMMENDED)

Extract the per-mode state machinery from `serverGrid.tsx` into named exports of `internal/useServerOrchestration.ts` (already exists for the shared debounce + mutation-id stream):

```ts
// New exports from internal/useServerOrchestration.ts:
export function usePagedOrchestration<TRow>(input: PagedOrchestrationInput<TRow>): PagedOrchestrationResult<TRow>
export function useInfiniteOrchestration<TRow>(input: InfiniteOrchestrationInput<TRow>): InfiniteOrchestrationResult<TRow>
export function useTreeOrchestration<TRow>(input: TreeOrchestrationInput<TRow>): TreeOrchestrationResult<TRow>
```

Both consumers:
- `<BcServerGrid>` calls `usePagedOrchestration` / `useInfiniteOrchestration` / `useTreeOrchestration` to assemble its `<BcGrid>`-bound rows.
- Each turnkey hook calls the same primitive AND derives its `serverProps` + `bound` from the result.

The orchestration is single-instance per (consumer, hook) pairing. When a consumer uses `useServerTreeGrid + <BcServerGrid {...grid.serverProps}>`, the hook owns the orchestration and `<BcServerGrid>` detects the marker (a hidden `__bcOrchestrationOwned` field on `serverProps`) and skips its inner instance. When a consumer uses `<BcServerGrid>` standalone (no hook), `<BcServerGrid>` runs its own orchestration as today.

- **Pros:** zero behavior change for `<BcServerGrid>`-only consumers; turnkey hooks now have the orchestration result to derive `bound` from.
- **Cons:** need a way for `<BcServerGrid>` to detect "orchestration already ran" — see §5 for the marker-prop discriminator.

**Recommendation:** Option B. The marker prop pattern is already used elsewhere in the codebase (e.g. `data-bc-grid-*` attributes for chrome detection). Implementation cost is moderate; behaviour change is zero for non-hook consumers.

## 5. Marker-prop discriminator for orchestration ownership

When `useServerTreeGrid` runs, it owns the orchestration. Its `serverProps` output includes a hidden marker:

```ts
const ORCHESTRATION_MARKER = Symbol.for("@bc-grid/server-orchestration-owned")

interface BcServerTreeBoundProps<TRow> extends BcServerTreeProps<TRow> {
  [ORCHESTRATION_MARKER]?: { rows: readonly TRow[]; loading: boolean; error: unknown; ... }
}
```

`<BcServerGrid>` checks for the marker; when present, it skips its own `useTreeServerState` and passes the marker's payload directly to the inner `<BcGrid>`. The marker stays on the `serverProps` object only — never leaks to the public type alias.

**Symbol vs string discriminator:** Symbol-keyed properties don't appear in `Object.keys` / `JSON.stringify` so they survive object-spreading-into-React-props cleanly without triggering React's "unknown DOM attribute" warning.

**Alternative:** a `__bcOrchestrationOwned: true` boolean property + a separate `__bcOrchestrationData` field. Less elegant but easier to debug in React DevTools. Open question for §13.

## 6. State + actions surface stays unchanged

Whether the consumer reads from `bound` or `serverProps`, the same `state` + `actions` are returned by the hook:

```ts
interface UseServerTreeGridState {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  expansion: ReadonlySet<RowId>
  loading: boolean
  error: unknown
}

interface UseServerTreeGridActions {
  reload: (opts?: { purge?: boolean }) => void
  invalidate: (invalidation: ServerInvalidation) => void
  expandRow: (rowId: RowId) => void
  collapseRow: (rowId: RowId) => void
  expandAllGroups: () => void
  collapseAllGroups: () => void
  applyOptimisticEdit: (input: { rowId: RowId; changes: Record<ColumnId, unknown> }) => string
}
```

These are the SAME values flowing through both outputs. Consumers use `state` for chrome (e.g. "Loading…" pill, error banner outside the grid frame) and `actions` for imperative drives (reload button, expand-all toolbar item).

## 7. Saved-view + persistence integration

`useServerTreeGrid` already supports `persistTo: "localStorage"` (#379). The persistence layer hydrates `sort` + `filter` from `bc-grid:<gridId>:*` on mount. Since `bound` carries the same controlled `sort` / `filter` state, persistence works identically — the consumer's `<BcGrid>` writes to localStorage via its existing `usePersistedGridStateWriter`, and the hook reads on mount.

No new persistence code needed. `bound` output reuses the hook's existing localStorage hydration.

## 8. apiRef threading

The `apiRef` chain stays the same:

```ts
useServerTreeGrid()  // creates apiRef
  → returns { bound: { apiRef, ... }, serverProps: { apiRef, ... } }
```

Both outputs share the same `apiRef`. When the consumer mounts `<BcGrid {...grid.bound}>`, the apiRef is populated by `<BcGrid>` with a `BcGridApi`. The hook's actions (`reload`, `expandAll`, etc.) call into `apiRef.current` — which is `BcGridApi` (not `BcServerGridApi`) when the consumer used `bound`.

**Open question:** the hook's `actions.reload()` today calls `apiRef.current?.refreshServerRows()` which is a `BcServerGridApi`-only method. When the consumer uses `bound`, that doesn't exist. The hook needs to dispatch the refresh through its own orchestration instead of through the apiRef. See §13 Q3.

## 9. Bound output for paged mode

`useServerPagedGrid().bound`:

```ts
{
  apiRef,
  rowId,
  data: rows,            // current page's rows
  loading,
  errorOverlay,          // from #468 wiring
  rowProcessingMode: "manual",
  sort,
  onSortChange,
  filter,
  onFilterChange,
  searchText,
  onSearchTextChange,
  pagination,            // { pageIndex, pageSize, totalRows }
  onPaginationChange,    // dispatches to hook's controlled pageIndex
  // Tree-only fields absent.
}
```

Pagination chrome reads `pagination` directly (consumer renders their own `<BcPagination>` or uses `<BcGrid>`'s built-in footer). The hook's `state.pagination` mirrors `bound.pagination` for chrome rendered outside the grid.

## 10. Bound output for infinite mode

`useServerInfiniteGrid().bound`:

```ts
{
  apiRef,
  rowId,
  data: rows,            // all loaded blocks merged + sorted
  loading,
  errorOverlay,
  rowProcessingMode: "manual",
  sort,
  onSortChange,
  filter,
  onFilterChange,
  searchText,
  onSearchTextChange,
  onVisibleRowRangeChange,  // dispatches block-load fetches as user scrolls
  // Pagination + expansion absent.
}
```

`onVisibleRowRangeChange` is what `<BcGrid>` calls on every viewport change — that's how the hook decides which blocks to fetch.

## 11. Recipe doc shape

`docs/recipes/server-grid-without-bcservergrid.md`:

1. Why use `bound` instead of `serverProps` (consumer wraps `<BcGrid>` in their own chrome / has a host-owned grid component).
2. Tree example (bsncraft-style customer tree).
3. Paged example.
4. Infinite example.
5. Migration from a `<BcServerGrid>`-based consumer to `bound`-based wrapper (~15 LOC delta).
6. When NOT to use `bound` (default chrome works fine, consumer just uses the recommended `<BcServerGrid>` path).

## 12. Test coverage

**Hook layer (`packages/react/tests/`):**

- `useServerTreeGrid` returns `bound` with `data`, controlled callbacks, `loading`, `errorOverlay`, mode-specific fields.
- `useServerPagedGrid` returns `bound` with `pagination` + `onPaginationChange`.
- `useServerInfiniteGrid` returns `bound` with `onVisibleRowRangeChange`.
- `bound.onSortChange(next)` triggers a fetch + updates `state.sort`.
- `bound.data` mirrors the hook's accumulated rows.
- `bound` + `serverProps` share the same orchestration (one fetch on view change, not two).

**Existing test sweep:** verify no regression in `<BcServerGrid>`-direct usage paths.

## 13. Open questions

1. **`props` → `serverProps` rename:** add `props` as a deprecated alias for v0.6.0, remove in v0.7? Or hard rename in v0.6 with a migration note? RFC defaults to alias (less disruption).

2. **Marker discriminator shape:** Symbol-keyed property (clean but harder to debug) vs `__bcOrchestrationOwned` boolean + `__bcOrchestrationData` payload (visible but slightly ugly). RFC recommends Symbol for prod cleanliness.

3. **Hook actions through `bound` apiRef:** when the consumer uses `bound` + `<BcGrid>` (not `<BcServerGrid>`), `apiRef.current` is `BcGridApi` (lacks `refreshServerRows` / `invalidateServerRows` / `getCacheStats` / etc.). The hook's `actions.reload()` needs to dispatch through the orchestration directly (not through apiRef) when the bound path is in use. Detect by the apiRef's runtime shape OR by an explicit `outputMode: "bound" | "server"` field captured at hook init?

4. **`useServerGrid` polymorphic hook:** does the polymorphic hook (#409) get a `bound` output too in this PR, or as a follow-up? RFC scopes it in but the surface needs the union shape carefully (mode-conditional fields for `expansion` / `pagination` vary by active loader). Confirm or split into a v0.6.1 follow-up.

5. **Selection / range / column-state passthrough:** `bound` doesn't include `selection` / `defaultColumnState` / etc. — those are not server-routed and the consumer manages them directly on `<BcGrid>`. Confirm this exclusion (no need to merge into bound, just spread alongside).

## 14. Decision log

(empty — populated as §13 ratifies.)
