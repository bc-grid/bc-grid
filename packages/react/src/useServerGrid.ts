import type {
  BcGridFilter,
  BcGridSort,
  BcScrollOptions,
  BcServerGridApi,
  ColumnId,
  LoadServerBlock,
  LoadServerPage,
  LoadServerTreeChildren,
  RowId,
  ServerBlockKey,
  ServerBlockQuery,
  ServerBlockResult,
  ServerGroupKey,
  ServerInvalidation,
  ServerLoadContext,
  ServerPagedQuery,
  ServerPagedResult,
  ServerRowModelMode,
  ServerRowPatch,
  ServerTreeQuery,
  ServerTreeResult,
} from "@bc-grid/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildOptimisticEditPatch as buildOptimisticEditPatchInternal,
  createServerLoadAbortError,
  isLoadAborted,
  useDebouncedValue as useDebouncedValueInternal,
  useMutationIdStream,
} from "./internal/useServerOrchestration"
import type { BcServerGridProps } from "./types"
import { applyGroupRowIdOverride } from "./useServerTreeGrid"

const HOOK_MUTATION_PREFIX = "useServerGrid"
const DEFAULT_DEBOUNCE_MS = 200
const DEFAULT_PAGE_SIZE = 100

/**
 * Initial values seeded into the hook's controlled-state surface.
 * All fields are optional. Mode-specific dimensions (page, pageSize,
 * expansion) are owned by the hook regardless of the active mode so
 * they can carry across mode switches per the server-mode-switch RFC
 * §4 carry-over contract.
 */
export interface UseServerGridInitial {
  sort?: readonly BcGridSort[]
  filter?: BcGridFilter | null
  search?: string
  groupBy?: readonly ColumnId[]
  expansion?: ReadonlySet<RowId>
  page?: number
  pageSize?: number
}

export interface UseServerGridOptions<TRow> {
  /**
   * Persistence + diagnostics key. Threaded into the returned `props`
   * so `<BcGrid>`'s existing `usePersistedGridStateWriter` continues
   * to write under `bc-grid:<gridId>:*`.
   */
  gridId: string
  /**
   * Stable row identity. Forwarded to `<BcServerGrid>` and used by
   * `actions.applyOptimisticEdit` to address the patched row.
   */
  rowId: (row: TRow) => RowId
  /**
   * One-shot initial values. Persisted values from the inner
   * `<BcGrid>`'s `gridId` localStorage win for the dimensions that
   * persist; this seed handles the dimensions persistence does not.
   */
  initial?: UseServerGridInitial
  /**
   * Debounce window (ms) applied before sort/filter/searchText changes
   * propagate into the server query. Default 200ms; `0` disables.
   * Mirrors the three single-mode hooks.
   */
  debounceMs?: number

  /**
   * Optional explicit row-model override. When omitted, the active
   * mode is derived from `groupBy` per the RFC heuristic
   * (`groupBy.length > 0 → "tree"`, else `"paged"`). Pass `"infinite"`
   * to force block-cache mode while keeping `groupBy` empty, or pass
   * `"paged"` while `groupBy` is non-empty if the server flattens the
   * grouped result into a paged response.
   */
  rowModel?: ServerRowModelMode

  /** Required when the active mode resolves to `"paged"`. */
  loadPage?: LoadServerPage<TRow>
  /** Required when the active mode resolves to `"infinite"`. */
  loadBlock?: LoadServerBlock<TRow>
  /** Required when the active mode resolves to `"tree"`. */
  loadChildren?: LoadServerTreeChildren<TRow>
  /** Optional separate loader for tree root rows; defaults to `loadChildren`. */
  loadRoots?: LoadServerTreeChildren<TRow>

  /** Forwarded to `<BcServerGrid>` as `initialResult` when paged is active. */
  initialResult?: ServerPagedResult<TRow>

  // Infinite-mode knobs (forwarded straight through).
  blockSize?: number
  maxCachedBlocks?: number
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  prefetchAhead?: number

  // Tree-mode knobs.
  childCount?: number
  initialRootChildCount?: number
  /**
   * Consumer override for stable group-row identifiers. Stamped onto
   * each `loadChildren` / `loadRoots` result before handing it to the
   * model. Required for selection algebra against group rows. See
   * `useServerTreeGrid` for the full contract.
   */
  groupRowId?: (key: ServerGroupKey, path: readonly ServerGroupKey[]) => RowId
}

export interface UseServerGridState<TRow> {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  groupBy: readonly ColumnId[]
  expansion: ReadonlySet<RowId>
  page: number
  pageSize: number
  loading: boolean
  error: unknown
  /**
   * Resolved mode at this render. Reflects `rowModel ?? heuristic(groupBy)`.
   * Consumers that branch on the active mode should read this rather
   * than re-running the heuristic locally.
   */
  activeMode: ServerRowModelMode
  /**
   * Last successful paged result, or `null` before the first paged
   * response. Cleared on mode flips out of paged.
   */
  lastPagedResult: ServerPagedResult<TRow> | null
  /**
   * Total rows reported by the most recent settled infinite block.
   * `"unknown"` until the first block settles or before any paged
   * response in paged mode. Mirrors `useServerInfiniteGrid` semantics.
   */
  totalRows: number | "unknown"
}

export interface UseServerGridActions {
  /** Re-fire the active fetch flow. Wraps `apiRef.current?.refreshServerRows`. */
  reload: (opts?: { purge?: boolean }) => void
  invalidate: (invalidation: ServerInvalidation) => void
  setPage: (next: number) => void
  setPageSize: (next: number) => void
  /**
   * Update the controlled `groupBy`. The structural mode-switch in
   * `<BcServerGrid>` aborts in-flight requests, drops the previous
   * mode's cache, and pins a one-frame loading state when the
   * resolved mode flips.
   */
  setGroupBy: (next: readonly ColumnId[]) => void
  expandRow: (rowId: RowId) => void
  collapseRow: (rowId: RowId) => void
  expandAllGroups: () => void
  collapseAllGroups: () => void
  retryBlock: (blockKey: ServerBlockKey) => void
  applyOptimisticEdit: (input: { rowId: RowId; changes: Record<ColumnId, unknown> }) => string
  scrollToCell: (
    rowId: RowId,
    columnId: ColumnId,
    opts?: BcScrollOptions & { pageIndex?: number },
  ) => Promise<{ scrolled: boolean }>
}

/**
 * Spread-ready props for `<BcServerGrid>`. Excludes `columns` so the
 * consumer owns column definitions at the JSX site.
 */
export type UseServerGridServerProps<TRow> = Omit<BcServerGridProps<TRow>, "columns">

export interface UseServerGridResult<TRow> {
  props: UseServerGridServerProps<TRow>
  state: UseServerGridState<TRow>
  actions: UseServerGridActions
}

/**
 * Polymorphic turnkey orchestration hook for `<BcServerGrid>`. Composes
 * with the structural mode polymorphism shipped in alpha.2 (see
 * `docs/design/server-mode-switch-rfc.md`) — owns one debounce, one
 * mutation-id stream, one apiRef, and one controlled `groupBy` pair;
 * routes to whichever mode-specific loader the consumer supplied.
 *
 * Recommended path for grids that switch between paged and tree as
 * the user toggles grouping (e.g. ERP customer lists). The single-mode
 * hooks (`useServerPagedGrid` / `useServerInfiniteGrid` /
 * `useServerTreeGrid`) remain as escape hatches for grids that don't
 * switch — they're slightly simpler for the single-mode case.
 *
 * Example:
 *
 * ```tsx
 * const grid = useServerGrid({
 *   gridId: "ar.customers",
 *   rowId: (row) => row.id,
 *   loadPage,
 *   loadChildren,
 *   initial: { groupBy: [] },
 * })
 * return <BcServerGrid<Customer> {...grid.props} columns={columns} />
 * ```
 */
export function useServerGrid<TRow>(opts: UseServerGridOptions<TRow>): UseServerGridResult<TRow> {
  const {
    gridId,
    rowId,
    initial,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    rowModel,
    loadPage,
    loadBlock,
    loadChildren,
    loadRoots,
    initialResult,
    blockSize,
    maxCachedBlocks,
    blockLoadDebounceMs,
    maxConcurrentRequests,
    prefetchAhead,
    childCount,
    initialRootChildCount,
    groupRowId,
  } = opts

  const apiRef = useRef<BcServerGridApi<TRow> | null>(null)
  const [sort, setSort] = useState<readonly BcGridSort[]>(() => initial?.sort ?? [])
  const [filter, setFilter] = useState<BcGridFilter | null>(() => initial?.filter ?? null)
  const [searchText, setSearchText] = useState<string>(() => initial?.search ?? "")
  const [groupBy, setGroupBy] = useState<readonly ColumnId[]>(() => initial?.groupBy ?? [])
  const [expansion, setExpansion] = useState<ReadonlySet<RowId>>(
    () => initial?.expansion ?? new Set<RowId>(),
  )
  const [page, setPage] = useState<number>(() => initial?.page ?? 0)
  const [pageSizeState, setPageSize] = useState<number>(
    () => initial?.pageSize ?? DEFAULT_PAGE_SIZE,
  )

  const debouncedSort = useDebouncedValueInternal(sort, debounceMs)
  const debouncedFilter = useDebouncedValueInternal(filter, debounceMs)
  const debouncedSearchText = useDebouncedValueInternal(searchText, debounceMs)

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<unknown>(null)
  const [lastPagedResult, setLastPagedResult] = useState<ServerPagedResult<TRow> | null>(null)
  const [totalRows, setTotalRows] = useState<number | "unknown">("unknown")

  const inFlightCountRef = useRef(0)
  const startLoad = useCallback(() => {
    inFlightCountRef.current += 1
    setLoading(true)
    setError(null)
  }, [])
  const settleLoad = useCallback(() => {
    inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1)
    if (inFlightCountRef.current === 0) setLoading(false)
  }, [])

  const loadPageRef = useRef(loadPage)
  const loadBlockRef = useRef(loadBlock)
  const loadChildrenRef = useRef(loadChildren)
  const loadRootsRef = useRef(loadRoots)
  const groupRowIdRef = useRef(groupRowId)
  useEffect(() => {
    loadPageRef.current = loadPage
  }, [loadPage])
  useEffect(() => {
    loadBlockRef.current = loadBlock
  }, [loadBlock])
  useEffect(() => {
    loadChildrenRef.current = loadChildren
  }, [loadChildren])
  useEffect(() => {
    loadRootsRef.current = loadRoots
  }, [loadRoots])
  useEffect(() => {
    groupRowIdRef.current = groupRowId
  }, [groupRowId])

  const wrappedLoadPage = useMemo<LoadServerPage<TRow> | undefined>(() => {
    if (!loadPage) return undefined
    return async (query: ServerPagedQuery, ctx: ServerLoadContext) => {
      startLoad()
      try {
        const result = await (loadPageRef.current as LoadServerPage<TRow>)(query, ctx)
        if (isLoadAborted(ctx.signal)) throw createServerLoadAbortError()
        setLastPagedResult(result)
        return result
      } catch (e) {
        if (isLoadAborted(ctx.signal)) throw e
        setError(e)
        throw e
      } finally {
        settleLoad()
      }
    }
  }, [loadPage, settleLoad, startLoad])

  const wrappedLoadBlock = useMemo<LoadServerBlock<TRow> | undefined>(() => {
    if (!loadBlock) return undefined
    return async (query: ServerBlockQuery, ctx: ServerLoadContext) => {
      startLoad()
      try {
        const result: ServerBlockResult<TRow> = await (
          loadBlockRef.current as LoadServerBlock<TRow>
        )(query, ctx)
        if (isLoadAborted(ctx.signal)) throw createServerLoadAbortError()
        if (typeof result.totalRows === "number") setTotalRows(result.totalRows)
        else if (result.hasMore === false) setTotalRows(result.blockStart + result.rows.length)
        return result
      } catch (e) {
        if (isLoadAborted(ctx.signal)) throw e
        setError(e)
        throw e
      } finally {
        settleLoad()
      }
    }
  }, [loadBlock, settleLoad, startLoad])

  const wrappedLoadChildren = useMemo<LoadServerTreeChildren<TRow> | undefined>(() => {
    if (!loadChildren) return undefined
    return async (query: ServerTreeQuery, ctx: ServerLoadContext) => {
      startLoad()
      try {
        const result: ServerTreeResult<TRow> = await (
          loadChildrenRef.current as LoadServerTreeChildren<TRow>
        )(query, ctx)
        if (isLoadAborted(ctx.signal)) throw createServerLoadAbortError()
        return applyGroupRowIdOverride(result, groupRowIdRef.current)
      } catch (e) {
        if (isLoadAborted(ctx.signal)) throw e
        setError(e)
        throw e
      } finally {
        settleLoad()
      }
    }
  }, [loadChildren, settleLoad, startLoad])

  const wrappedLoadRoots = useMemo<LoadServerTreeChildren<TRow> | undefined>(() => {
    if (!loadRoots) return undefined
    return async (query: ServerTreeQuery, ctx: ServerLoadContext) => {
      startLoad()
      try {
        const result = await (loadRootsRef.current as LoadServerTreeChildren<TRow>)(query, ctx)
        if (isLoadAborted(ctx.signal)) throw createServerLoadAbortError()
        return applyGroupRowIdOverride(result, groupRowIdRef.current)
      } catch (e) {
        if (isLoadAborted(ctx.signal)) throw e
        setError(e)
        throw e
      } finally {
        settleLoad()
      }
    }
  }, [loadRoots, settleLoad, startLoad])

  const handlePaginationChange = useCallback((next: { page: number; pageSize: number }) => {
    setPage(next.page)
    setPageSize(next.pageSize)
  }, [])

  const handleGroupByChange = useCallback((next: readonly ColumnId[]) => {
    setGroupBy(next)
  }, [])

  const handleExpansionChange = useCallback((next: ReadonlySet<RowId>) => {
    setExpansion(next)
  }, [])

  const reload = useCallback((reloadOpts?: { purge?: boolean }) => {
    apiRef.current?.refreshServerRows(reloadOpts)
  }, [])

  const invalidate = useCallback((invalidation: ServerInvalidation) => {
    apiRef.current?.invalidateServerRows(invalidation)
  }, [])

  const expandRow = useCallback((targetRowId: RowId) => {
    setExpansion((prev) => {
      if (prev.has(targetRowId)) return prev
      const next = new Set(prev)
      next.add(targetRowId)
      return next
    })
  }, [])

  const collapseRow = useCallback((targetRowId: RowId) => {
    setExpansion((prev) => {
      if (!prev.has(targetRowId)) return prev
      const next = new Set(prev)
      next.delete(targetRowId)
      return next
    })
  }, [])

  const expandAllGroups = useCallback(() => {
    apiRef.current?.expandAll()
  }, [])

  const collapseAllGroups = useCallback(() => {
    apiRef.current?.collapseAll()
  }, [])

  const retryBlock = useCallback((blockKey: ServerBlockKey) => {
    apiRef.current?.retryServerBlock(blockKey)
  }, [])

  const nextMutationId = useMutationIdStream(HOOK_MUTATION_PREFIX)
  const applyOptimisticEdit = useCallback(
    (input: { rowId: RowId; changes: Record<ColumnId, unknown> }) => {
      const mutationId = nextMutationId()
      const patch: ServerRowPatch = {
        mutationId,
        rowId: input.rowId,
        changes: input.changes,
      }
      apiRef.current?.queueServerRowMutation(patch)
      return mutationId
    },
    [nextMutationId],
  )

  const scrollToCell = useCallback(
    (
      cellRowId: RowId,
      columnId: ColumnId,
      scrollOpts?: BcScrollOptions & { pageIndex?: number },
    ): Promise<{ scrolled: boolean }> =>
      apiRef.current?.scrollToServerCell(cellRowId, columnId, scrollOpts) ??
      Promise.resolve({ scrolled: false }),
    [],
  )

  const activeMode = resolveServerGridActiveMode({ rowModel, groupBy })

  const props = useMemo<UseServerGridServerProps<TRow>>(
    () => ({
      apiRef,
      gridId,
      rowId,
      ...(rowModel !== undefined ? { rowModel } : {}),
      ...(wrappedLoadPage !== undefined ? { loadPage: wrappedLoadPage } : {}),
      ...(wrappedLoadBlock !== undefined ? { loadBlock: wrappedLoadBlock } : {}),
      ...(wrappedLoadChildren !== undefined ? { loadChildren: wrappedLoadChildren } : {}),
      ...(wrappedLoadRoots !== undefined ? { loadRoots: wrappedLoadRoots } : {}),
      sort: debouncedSort,
      onSortChange: (next) => setSort(next),
      filter: debouncedFilter,
      onFilterChange: (next) => setFilter(next),
      searchText: debouncedSearchText,
      onSearchTextChange: (next) => setSearchText(next),
      groupBy,
      onGroupByChange: handleGroupByChange,
      expansion,
      onExpansionChange: handleExpansionChange,
      page,
      pageSize: pageSizeState,
      onPaginationChange: handlePaginationChange,
      ...(initialResult !== undefined ? { initialResult } : {}),
      ...(blockSize !== undefined ? { blockSize } : {}),
      ...(maxCachedBlocks !== undefined ? { maxCachedBlocks } : {}),
      ...(blockLoadDebounceMs !== undefined ? { blockLoadDebounceMs } : {}),
      ...(maxConcurrentRequests !== undefined ? { maxConcurrentRequests } : {}),
      ...(prefetchAhead !== undefined ? { prefetchAhead } : {}),
      ...(childCount !== undefined ? { childCount } : {}),
      ...(initialRootChildCount !== undefined ? { initialRootChildCount } : {}),
    }),
    [
      gridId,
      rowId,
      rowModel,
      wrappedLoadPage,
      wrappedLoadBlock,
      wrappedLoadChildren,
      wrappedLoadRoots,
      debouncedSort,
      debouncedFilter,
      debouncedSearchText,
      groupBy,
      handleGroupByChange,
      expansion,
      handleExpansionChange,
      page,
      pageSizeState,
      handlePaginationChange,
      initialResult,
      blockSize,
      maxCachedBlocks,
      blockLoadDebounceMs,
      maxConcurrentRequests,
      prefetchAhead,
      childCount,
      initialRootChildCount,
    ],
  )

  const state = useMemo<UseServerGridState<TRow>>(
    () => ({
      sort,
      filter,
      searchText,
      groupBy,
      expansion,
      page,
      pageSize: pageSizeState,
      loading,
      error,
      activeMode,
      lastPagedResult,
      totalRows,
    }),
    [
      sort,
      filter,
      searchText,
      groupBy,
      expansion,
      page,
      pageSizeState,
      loading,
      error,
      activeMode,
      lastPagedResult,
      totalRows,
    ],
  )

  const actions = useMemo<UseServerGridActions>(
    () => ({
      reload,
      invalidate,
      setPage,
      setPageSize,
      setGroupBy,
      expandRow,
      collapseRow,
      expandAllGroups,
      collapseAllGroups,
      retryBlock,
      applyOptimisticEdit,
      scrollToCell,
    }),
    [
      reload,
      invalidate,
      expandRow,
      collapseRow,
      expandAllGroups,
      collapseAllGroups,
      retryBlock,
      applyOptimisticEdit,
      scrollToCell,
    ],
  )

  return { props, state, actions }
}

/**
 * Re-export of the shared debounce primitive for parity with the
 * single-mode hooks. New code should prefer the shared primitive.
 */
export const useDebouncedValue = useDebouncedValueInternal

/**
 * Pure helper exported for unit testing. Resolves the active row-model
 * mode from the explicit `rowModel` override and the controlled
 * `groupBy` array. Mirrors `<BcServerGrid>`'s internal heuristic
 * (`resolveActiveRowModelMode`):
 *
 * - explicit `rowModel` wins;
 * - otherwise non-empty `groupBy` → `"tree"`;
 * - otherwise `"paged"`.
 */
export function resolveServerGridActiveMode(input: {
  rowModel: ServerRowModelMode | undefined
  groupBy: readonly ColumnId[] | undefined
}): ServerRowModelMode {
  if (input.rowModel !== undefined) return input.rowModel
  if (input.groupBy && input.groupBy.length > 0) return "tree"
  return "paged"
}

/**
 * Pure helper exported for unit testing. Decides the initial values
 * for the hook's controlled-state surface, blending `initial` with
 * built-in defaults.
 */
export function resolveInitialServerGridState(initial: UseServerGridInitial | undefined): {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  groupBy: readonly ColumnId[]
  expansion: ReadonlySet<RowId>
  page: number
  pageSize: number
} {
  return {
    sort: initial?.sort ?? [],
    filter: initial?.filter ?? null,
    searchText: initial?.search ?? "",
    groupBy: initial?.groupBy ?? [],
    expansion: initial?.expansion ?? new Set<RowId>(),
    page: Number.isFinite(initial?.page) ? Math.max(0, Math.floor(initial?.page ?? 0)) : 0,
    pageSize: Number.isFinite(initial?.pageSize)
      ? Math.max(1, Math.floor(initial?.pageSize ?? DEFAULT_PAGE_SIZE))
      : DEFAULT_PAGE_SIZE,
  }
}

/**
 * Pure helper exported for unit testing. Builds an optimistic-edit
 * patch with the `useServerGrid:` mutation-ID prefix.
 */
export function buildOptimisticEditPatch(input: {
  rowId: RowId
  changes: Record<ColumnId, unknown>
  sequence: number
}): ServerRowPatch {
  return buildOptimisticEditPatchInternal({
    rowId: input.rowId,
    changes: input.changes,
    prefix: HOOK_MUTATION_PREFIX,
    sequence: input.sequence,
  })
}

/**
 * Pure helper exported for unit testing. Validates that the loader
 * matching the resolved active mode is present. Returns `null` when
 * the loader is supplied; otherwise returns a developer-friendly
 * console-error message describing the missing loader. The runtime
 * loader-presence assertion lives in `<BcServerGrid>` itself; this
 * helper exposes the same check at the hook layer for consumer-side
 * validation (e.g. tests that mount with an incomplete loader set).
 */
export function resolveServerGridMissingLoaderMessage(input: {
  activeMode: ServerRowModelMode
  loadPage: unknown
  loadBlock: unknown
  loadChildren: unknown
}): string | null {
  if (input.activeMode === "paged" && input.loadPage === undefined) {
    return 'useServerGrid: active mode is "paged" but `loadPage` is missing'
  }
  if (input.activeMode === "infinite" && input.loadBlock === undefined) {
    return 'useServerGrid: active mode is "infinite" but `loadBlock` is missing'
  }
  if (input.activeMode === "tree" && input.loadChildren === undefined) {
    return 'useServerGrid: active mode is "tree" but `loadChildren` is missing'
  }
  return null
}
