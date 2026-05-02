import {
  type BcCellPosition,
  type BcColumnStateEntry,
  type BcGridFilter,
  type BcGridSort,
  type BcPivotState,
  type BcRangeSelection,
  type BcSelection,
  type ColumnId,
  type RowId,
  emptyBcPivotState,
  emptyBcRangeSelection,
} from "@bc-grid/core"
import { useCallback, useMemo, useState } from "react"
import { type PersistedGridState, readPersistedGridState } from "./persistence"

/**
 * Aggregated controlled-state values that `useBcGridState` owns.
 *
 * One field per `BcGridStateProps` controlled-state pair (and `sidebarPanel`
 * from `BcGridProps`). Built so the entire state surface is one shape the
 * consumer can serialize, log, or assert against.
 */
export interface BcGridStateValues {
  sort: readonly BcGridSort[]
  searchText: string
  filter: BcGridFilter | null
  selection: BcSelection
  rangeSelection: BcRangeSelection
  expansion: ReadonlySet<RowId>
  groupBy: readonly ColumnId[]
  pivotState: BcPivotState
  columnState: readonly BcColumnStateEntry[]
  activeCell: BcCellPosition | null
  page: number
  pageSize: number
  sidebarPanel: string | null
}

/**
 * Imperative setters paired with `BcGridStateValues`. Each setter accepts
 * the same shape as the matching `BcGridProps` controlled-state callback's
 * `next` argument so consumers can dispatch from custom UI without
 * mounting controlled props themselves.
 */
export interface BcGridStateDispatch {
  setSort: (next: readonly BcGridSort[]) => void
  setSearchText: (next: string) => void
  setFilter: (next: BcGridFilter | null) => void
  setSelection: (next: BcSelection) => void
  setRangeSelection: (next: BcRangeSelection) => void
  setExpansion: (next: ReadonlySet<RowId>) => void
  setGroupBy: (next: readonly ColumnId[]) => void
  setPivotState: (next: BcPivotState) => void
  setColumnState: (next: readonly BcColumnStateEntry[]) => void
  setActiveCell: (next: BcCellPosition | null) => void
  setPage: (next: number) => void
  setPageSize: (next: number) => void
  setSidebarPanel: (next: string | null) => void
  reset: () => void
}

/**
 * Spread-ready controlled-state props derived from the hook's internal
 * state. Apply with `<BcGrid {...result.props} columns={…} data={…} />`
 * — the hook does not own row data, columns, identity, or rendering
 * concerns.
 *
 * `gridId` flows through when persistence is enabled so `<BcGrid>`'s
 * existing `usePersistedGridStateWriter` continues to write under the
 * same `bc-grid:<gridId>:*` keys the hook seeded from on mount. We do
 * not reach into storage from inside the hook on every change — the
 * grid already does that, and double-writing would burn storage churn.
 */
export interface BcGridStateBoundProps {
  gridId?: string
  sort: readonly BcGridSort[]
  onSortChange: (next: readonly BcGridSort[]) => void
  searchText: string
  onSearchTextChange: (next: string) => void
  filter: BcGridFilter | null
  onFilterChange: (next: BcGridFilter | null) => void
  selection: BcSelection
  onSelectionChange: (next: BcSelection) => void
  rangeSelection: BcRangeSelection
  onRangeSelectionChange: (next: BcRangeSelection) => void
  expansion: ReadonlySet<RowId>
  onExpansionChange: (next: ReadonlySet<RowId>) => void
  groupBy: readonly ColumnId[]
  onGroupByChange: (next: readonly ColumnId[]) => void
  pivotState: BcPivotState
  onPivotStateChange: (next: BcPivotState) => void
  columnState: readonly BcColumnStateEntry[]
  onColumnStateChange: (next: readonly BcColumnStateEntry[]) => void
  activeCell: BcCellPosition | null
  onActiveCellChange: (next: BcCellPosition | null) => void
  page: number
  pageSize: number
  onPaginationChange: (next: { page: number; pageSize: number }) => void
  sidebarPanel: string | null
  onSidebarPanelChange: (next: string | null) => void
}

export interface UseBcGridStateOptions {
  /**
   * Persistence target. `local:<gridId>` seeds initial state from
   * `localStorage` under the same keys `BcGrid` writes to via
   * `usePersistedGridStateWriter`, and surfaces `gridId` on returned
   * `props.gridId` so the grid continues to persist on change.
   *
   * Persistence is best-effort: SSR, sandboxed iframes, and storage
   * quota errors are silently ignored — the hook falls through to
   * `defaults` and built-in empty values.
   */
  persistTo?: `local:${string}`
  /**
   * Per-dimension defaults. Applied when no persisted value exists for
   * that dimension; persisted values win. Anything not specified falls
   * through to a built-in empty value (empty arrays, `null` filter,
   * page 1, pageSize 25, etc.).
   */
  defaults?: Partial<BcGridStateValues>
  /**
   * Hint that the host is server-paged. Reserved for `useServerPagedGrid`
   * integration — today it only affects whether `page` defaults to 1
   * (server) or 0 (client). Consumers wiring server pagination should
   * treat this as an alias for "the host owns page slicing"; `page` /
   * `pageSize` continue to flow through `props` regardless.
   */
  server?: boolean
}

export interface BcGridStateBindings {
  state: BcGridStateValues
  dispatch: BcGridStateDispatch
  props: BcGridStateBoundProps
}

const DEFAULT_PAGE_SIZE = 25

/**
 * Turnkey state hook for `<BcGrid>`. Owns the ~13 controlled-state
 * dimensions a typical ERP grid consumer would otherwise wire by hand
 * (sort, filter, search, selection, range, expansion, grouping, pivot,
 * columnState, activeCell, page, pageSize, sidebar).
 *
 * Pairs with `<BcGrid>`'s existing controlled-prop API — consumers who
 * need finer-grained ownership (split state across components, route
 * onChange to Redux, etc.) keep the hand-wired path. This hook is the
 * default-controlled shortcut, not a replacement.
 *
 * Audit-2026-05 P0-5 / synthesis sprint plan v0.5.
 *
 * Example:
 *
 * ```tsx
 * const grid = useBcGridState({ persistTo: "local:customers" })
 * return <BcGrid {...grid.props} columns={columns} data={rows} rowId={getRowId} />
 * ```
 */
export function useBcGridState(options: UseBcGridStateOptions = {}): BcGridStateBindings {
  const gridId = parseLocalPersistTarget(options.persistTo)
  const { defaults, server } = options

  // Initial values: persisted > defaults > built-in empty. We seed
  // useState from a one-shot resolver so the read happens lazily and
  // SSR-safely (readPersistedGridState short-circuits when storage
  // is unavailable).
  const [state, setState] = useState<BcGridStateValues>(() =>
    resolveInitialState({ gridId, defaults, server }),
  )

  // Memoised setters per dimension. `useCallback` over `useMemo` here
  // is intentional — each setter's identity is stable across renders
  // so consumers can spread `dispatch` into deps arrays safely.
  const setSort = useCallback<BcGridStateDispatch["setSort"]>(
    (next) => setState((prev) => (prev.sort === next ? prev : { ...prev, sort: next })),
    [],
  )
  const setSearchText = useCallback<BcGridStateDispatch["setSearchText"]>(
    (next) => setState((prev) => (prev.searchText === next ? prev : { ...prev, searchText: next })),
    [],
  )
  const setFilter = useCallback<BcGridStateDispatch["setFilter"]>(
    (next) => setState((prev) => (prev.filter === next ? prev : { ...prev, filter: next })),
    [],
  )
  const setSelection = useCallback<BcGridStateDispatch["setSelection"]>(
    (next) => setState((prev) => (prev.selection === next ? prev : { ...prev, selection: next })),
    [],
  )
  const setRangeSelection = useCallback<BcGridStateDispatch["setRangeSelection"]>(
    (next) =>
      setState((prev) => (prev.rangeSelection === next ? prev : { ...prev, rangeSelection: next })),
    [],
  )
  const setExpansion = useCallback<BcGridStateDispatch["setExpansion"]>(
    (next) => setState((prev) => (prev.expansion === next ? prev : { ...prev, expansion: next })),
    [],
  )
  const setGroupBy = useCallback<BcGridStateDispatch["setGroupBy"]>(
    (next) => setState((prev) => (prev.groupBy === next ? prev : { ...prev, groupBy: next })),
    [],
  )
  const setPivotState = useCallback<BcGridStateDispatch["setPivotState"]>(
    (next) => setState((prev) => (prev.pivotState === next ? prev : { ...prev, pivotState: next })),
    [],
  )
  const setColumnState = useCallback<BcGridStateDispatch["setColumnState"]>(
    (next) =>
      setState((prev) => (prev.columnState === next ? prev : { ...prev, columnState: next })),
    [],
  )
  const setActiveCell = useCallback<BcGridStateDispatch["setActiveCell"]>(
    (next) => setState((prev) => (prev.activeCell === next ? prev : { ...prev, activeCell: next })),
    [],
  )
  const setPage = useCallback<BcGridStateDispatch["setPage"]>(
    (next) => setState((prev) => (prev.page === next ? prev : { ...prev, page: next })),
    [],
  )
  const setPageSize = useCallback<BcGridStateDispatch["setPageSize"]>(
    (next) => setState((prev) => (prev.pageSize === next ? prev : { ...prev, pageSize: next })),
    [],
  )
  const setSidebarPanel = useCallback<BcGridStateDispatch["setSidebarPanel"]>(
    (next) =>
      setState((prev) => (prev.sidebarPanel === next ? prev : { ...prev, sidebarPanel: next })),
    [],
  )
  const reset = useCallback<BcGridStateDispatch["reset"]>(() => {
    setState(resolveInitialState({ gridId, defaults, server }))
  }, [gridId, defaults, server])

  const dispatch = useMemo<BcGridStateDispatch>(
    () => ({
      setSort,
      setSearchText,
      setFilter,
      setSelection,
      setRangeSelection,
      setExpansion,
      setGroupBy,
      setPivotState,
      setColumnState,
      setActiveCell,
      setPage,
      setPageSize,
      setSidebarPanel,
      reset,
    }),
    [
      setSort,
      setSearchText,
      setFilter,
      setSelection,
      setRangeSelection,
      setExpansion,
      setGroupBy,
      setPivotState,
      setColumnState,
      setActiveCell,
      setPage,
      setPageSize,
      setSidebarPanel,
      reset,
    ],
  )

  // The `BcGridProps` controlled-state callbacks fire with `(next, prev)`.
  // Our setters drop `prev` because the hook is the source of truth for
  // it; any consumer that needs the previous value subscribes to its own
  // before-state via the returned `state` field.
  const handlePaginationChange = useCallback((next: { page: number; pageSize: number }) => {
    setState((prev) =>
      prev.page === next.page && prev.pageSize === next.pageSize
        ? prev
        : { ...prev, page: next.page, pageSize: next.pageSize },
    )
  }, [])

  const props = useMemo<BcGridStateBoundProps>(
    () => ({
      ...(gridId ? { gridId } : {}),
      sort: state.sort,
      onSortChange: setSort,
      searchText: state.searchText,
      onSearchTextChange: setSearchText,
      filter: state.filter,
      onFilterChange: setFilter,
      selection: state.selection,
      onSelectionChange: setSelection,
      rangeSelection: state.rangeSelection,
      onRangeSelectionChange: setRangeSelection,
      expansion: state.expansion,
      onExpansionChange: setExpansion,
      groupBy: state.groupBy,
      onGroupByChange: setGroupBy,
      pivotState: state.pivotState,
      onPivotStateChange: setPivotState,
      columnState: state.columnState,
      onColumnStateChange: setColumnState,
      activeCell: state.activeCell,
      onActiveCellChange: setActiveCell,
      page: state.page,
      pageSize: state.pageSize,
      onPaginationChange: handlePaginationChange,
      sidebarPanel: state.sidebarPanel,
      onSidebarPanelChange: setSidebarPanel,
    }),
    [
      gridId,
      state,
      setSort,
      setSearchText,
      setFilter,
      setSelection,
      setRangeSelection,
      setExpansion,
      setGroupBy,
      setPivotState,
      setColumnState,
      setActiveCell,
      setSidebarPanel,
      handlePaginationChange,
    ],
  )

  return { state, dispatch, props }
}

/**
 * Resolve `local:<gridId>` to the `<gridId>` portion. Returns `undefined`
 * for any other (or absent) value. The hook only supports a typed
 * `local:` prefix today; URL-state and consumer-supplied storage are
 * follow-ups.
 *
 * Exported for unit testing.
 */
export function parseLocalPersistTarget(persistTo: string | undefined): string | undefined {
  if (typeof persistTo !== "string") return undefined
  if (!persistTo.startsWith("local:")) return undefined
  const id = persistTo.slice("local:".length).trim()
  return id.length > 0 ? id : undefined
}

/**
 * Pure resolver merging built-in empty defaults, consumer-supplied
 * defaults, and persisted state into a single initial value snapshot.
 *
 * Precedence (low → high): built-in empty < `defaults` < persisted.
 * The persisted layer is read once via `readPersistedGridState`, which
 * is SSR-safe (returns `{}` when storage is unavailable). Persisted
 * values that don't carry over (selection, range, search) come from
 * `defaults` or the empty fallback.
 *
 * Exported for unit-testing the precedence rules in isolation.
 */
export function resolveInitialState({
  gridId,
  defaults,
  server,
  persisted,
}: {
  gridId: string | undefined
  defaults: Partial<BcGridStateValues> | undefined
  server: boolean | undefined
  /** Override for tests. When omitted, reads from default storage. */
  persisted?: PersistedGridState
}): BcGridStateValues {
  const persist = persisted ?? readPersistedGridState(gridId)
  const empty = emptyState(server === true)
  return {
    sort: persist.sort ?? defaults?.sort ?? empty.sort,
    searchText: defaults?.searchText ?? empty.searchText,
    filter: persist.filter ?? defaults?.filter ?? empty.filter,
    selection: defaults?.selection ?? empty.selection,
    rangeSelection: defaults?.rangeSelection ?? empty.rangeSelection,
    expansion: defaults?.expansion ?? empty.expansion,
    groupBy: persist.groupBy ?? defaults?.groupBy ?? empty.groupBy,
    pivotState: persist.pivotState ?? defaults?.pivotState ?? empty.pivotState,
    columnState: persist.columnState ?? defaults?.columnState ?? empty.columnState,
    activeCell: defaults?.activeCell ?? empty.activeCell,
    page: defaults?.page ?? empty.page,
    pageSize: persist.pageSize ?? defaults?.pageSize ?? empty.pageSize,
    sidebarPanel:
      persist.sidebarPanel !== undefined
        ? (persist.sidebarPanel ?? null)
        : (defaults?.sidebarPanel ?? empty.sidebarPanel),
  }
}

function emptyState(server: boolean): BcGridStateValues {
  return {
    sort: [],
    searchText: "",
    filter: null,
    selection: { mode: "explicit", rowIds: new Set() },
    rangeSelection: emptyBcRangeSelection,
    expansion: new Set(),
    groupBy: [],
    pivotState: emptyBcPivotState,
    columnState: [],
    activeCell: null,
    // Server-paged grids conventionally use 1-indexed pages; client grids
    // can start anywhere — both clamp to 1 on first render. We default
    // to 1 either way so the value is stable across mode flips.
    page: server ? 1 : 1,
    pageSize: DEFAULT_PAGE_SIZE,
    sidebarPanel: null,
  }
}
