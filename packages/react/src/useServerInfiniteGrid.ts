import type {
  BcGridFilter,
  BcGridSort,
  BcServerGridApi,
  ColumnId,
  LoadServerBlock,
  RowId,
  ServerBlockKey,
  ServerBlockQuery,
  ServerBlockResult,
  ServerInvalidation,
  ServerLoadContext,
  ServerRowPatch,
} from "@bc-grid/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildOptimisticEditPatch as buildOptimisticEditPatchInternal,
  createServerLoadAbortError,
  isLoadAborted,
  useDebouncedValue as useDebouncedValueInternal,
  useMutationIdStream,
} from "./internal/useServerOrchestration"
import type { BcServerInfiniteProps } from "./types"

const HOOK_MUTATION_PREFIX = "useServerInfiniteGrid"
const DEFAULT_DEBOUNCE_MS = 200

/**
 * Initial values the hook seeds into its controlled-state surface.
 * Infinite scrolling has no page concept, so `page` / `pageSize` are
 * intentionally absent compared to `useServerPagedGrid`.
 */
export interface UseServerInfiniteGridInitial {
  sort?: readonly BcGridSort[]
  filter?: BcGridFilter | null
  search?: string
}

export interface UseServerInfiniteGridOptions<TRow> {
  /**
   * Persistence + diagnostics key. Threaded into the returned `props`
   * so `<BcGrid>`'s existing `usePersistedGridStateWriter` continues to
   * write under `bc-grid:<gridId>:*` for the dimensions it persists.
   */
  gridId: string
  /**
   * Server block loader. Wrapped internally so the hook can surface
   * `state.loading` / `state.error` without the consumer mounting a
   * second tracker.
   */
  loadBlock: LoadServerBlock<TRow>
  /**
   * Stable row identity. Forwarded to `<BcServerGrid>` as `rowId` and
   * used by `actions.applyOptimisticEdit` to address the patched row.
   */
  rowId: (row: TRow) => RowId
  /**
   * One-shot initial values for the controlled-state surface.
   */
  initial?: UseServerInfiniteGridInitial
  /**
   * Debounce window (ms) applied before filter / search / sort changes
   * propagate into the server query. Default 200ms; set to `0` to
   * disable. Mirrors `useServerPagedGrid`.
   */
  debounceMs?: number
  /**
   * Block-cache configuration forwarded to the underlying
   * `<BcServerGrid rowModel="infinite">` props. Defaults come from
   * `@bc-grid/server-row-model`'s `DEFAULT_BLOCK_CACHE_OPTIONS`.
   */
  blockSize?: number
  maxCachedBlocks?: number
  blockLoadDebounceMs?: number
  maxConcurrentRequests?: number
  /**
   * Number of blocks to fetch ahead of the visible viewport on each
   * scroll-driven `onVisibleRowRangeChange`. Default 1. Higher values
   * smooth scroll-cliff jank for fast scrollers at the cost of more
   * bandwidth; `0` disables prefetch entirely. Forwarded to
   * `BcServerInfiniteProps.prefetchAhead`.
   */
  prefetchAhead?: number
}

export interface UseServerInfiniteGridState {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  loading: boolean
  error: unknown
  /**
   * Total rows reported by the most recent settled block (`totalRows`
   * if the server provided it, otherwise `null` until the server
   * indicates `hasMore: false`). `"unknown"` until the first block
   * settles.
   */
  totalRows: number | "unknown"
}

export interface UseServerInfiniteGridActions {
  /**
   * Re-fire the active block fetch flow (purges visible blocks and
   * reloads). Wraps `apiRef.current?.refreshServerRows({ purge: true })`.
   */
  reload: () => void
  /**
   * Invalidate a specific block (or scope) without rebuilding the
   * entire cache. Wraps `apiRef.current?.invalidateServerRows`.
   */
  invalidate: (invalidation: ServerInvalidation) => void
  /**
   * Manually re-request a single block that previously failed. Wraps
   * `apiRef.current?.retryServerBlock`.
   */
  retryBlock: (blockKey: ServerBlockKey) => void
  /**
   * Queue an optimistic edit overlay against the server row model
   * cache. Returns the deterministic mutation ID
   * (`useServerInfiniteGrid:N`) so consumers can correlate hook-issued
   * patches in their `onServerRowMutation` settle handler.
   */
  applyOptimisticEdit: (input: { rowId: RowId; changes: Record<ColumnId, unknown> }) => string
}

/**
 * Spread-ready props for `<BcServerGrid rowModel="infinite">`.
 * Excludes `columns` — the consumer still owns column definitions at
 * the JSX site so the hook does not constrain column generics or
 * rendering.
 *
 * Apply with:
 *
 * ```tsx
 * <BcServerGrid {...grid.props} columns={columns} />
 * ```
 */
export type UseServerInfiniteGridBoundProps<TRow> = Omit<BcServerInfiniteProps<TRow>, "columns">

/**
 * `<BcServerGrid>`-shaped output type alias — preferred name as of
 * v1.0 per the API surface freeze audit (`docs/design/v1-api-surface-audit.md
 * §5 RENAME`). Use `UseServerInfiniteGridServerProps` in new code;
 * the legacy `UseServerInfiniteGridBoundProps` is kept as a
 * deprecated alias through v1.1.
 */
export type UseServerInfiniteGridServerProps<TRow> = UseServerInfiniteGridBoundProps<TRow>

export interface UseServerInfiniteGridResult<TRow> {
  props: UseServerInfiniteGridBoundProps<TRow>
  state: UseServerInfiniteGridState
  actions: UseServerInfiniteGridActions
}

/**
 * Turnkey orchestration hook for server-infinite-scroll grids.
 * Companion to `useServerPagedGrid`; same `{ props, state, actions }`
 * shape adapted for the block-cache row model. Audit-2026-05 P0-6
 * follow-up — closes the v0.5 server-side parity story.
 *
 * The hook composes `<BcServerGrid rowModel="infinite">`'s existing
 * block-cache + viewport-driven prefetch + stale-response gate rather
 * than duplicating them; it adds the consumer-facing controlled-state
 * plumbing, debounce, optimistic-edit ID stream, and a loading/error
 * surface that surfaces through `state` instead of disappearing into
 * the loading overlay.
 *
 * Example:
 *
 * ```tsx
 * const grid = useServerInfiniteGrid({
 *   gridId: "ar.invoices",
 *   loadBlock,
 *   rowId: (row) => row.id,
 * })
 * return (
 *   <BcServerGrid<Invoice> {...grid.props} columns={columns} />
 * )
 * ```
 */
export function useServerInfiniteGrid<TRow>(
  opts: UseServerInfiniteGridOptions<TRow>,
): UseServerInfiniteGridResult<TRow> {
  const {
    gridId,
    loadBlock,
    rowId,
    initial,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    blockSize,
    maxCachedBlocks,
    blockLoadDebounceMs,
    maxConcurrentRequests,
    prefetchAhead,
  } = opts

  const apiRef = useRef<BcServerGridApi<TRow> | null>(null)
  const [sort, setSort] = useState<readonly BcGridSort[]>(() => initial?.sort ?? [])
  const [filter, setFilter] = useState<BcGridFilter | null>(() => initial?.filter ?? null)
  const [searchText, setSearchText] = useState<string>(() => initial?.search ?? "")

  const debouncedSort = useDebouncedValueInternal(sort, debounceMs)
  const debouncedFilter = useDebouncedValueInternal(filter, debounceMs)
  const debouncedSearchText = useDebouncedValueInternal(searchText, debounceMs)

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<unknown>(null)
  const [totalRows, setTotalRows] = useState<number | "unknown">("unknown")

  const inFlightCountRef = useRef(0)
  const loadBlockRef = useRef(loadBlock)
  useEffect(() => {
    loadBlockRef.current = loadBlock
  }, [loadBlock])

  const wrappedLoadBlock = useCallback<LoadServerBlock<TRow>>(
    async (query: ServerBlockQuery, ctx: ServerLoadContext) => {
      inFlightCountRef.current += 1
      setLoading(true)
      setError(null)
      try {
        const result: ServerBlockResult<TRow> = await loadBlockRef.current(query, ctx)
        if (isLoadAborted(ctx.signal)) {
          throw createServerLoadAbortError()
        }
        if (typeof result.totalRows === "number") setTotalRows(result.totalRows)
        else if (result.hasMore === false) setTotalRows(result.blockStart + result.rows.length)
        return result
      } catch (e) {
        if (isLoadAborted(ctx.signal)) throw e
        setError(e)
        throw e
      } finally {
        inFlightCountRef.current -= 1
        if (inFlightCountRef.current <= 0) setLoading(false)
      }
    },
    [],
  )

  const reload = useCallback(() => {
    apiRef.current?.refreshServerRows({ purge: true })
  }, [])

  const invalidate = useCallback((invalidation: ServerInvalidation) => {
    apiRef.current?.invalidateServerRows(invalidation)
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

  const props = useMemo<UseServerInfiniteGridBoundProps<TRow>>(
    () => ({
      apiRef,
      gridId,
      rowId,
      rowModel: "infinite" as const,
      loadBlock: wrappedLoadBlock,
      sort: debouncedSort,
      onSortChange: (next) => setSort(next),
      filter: debouncedFilter,
      onFilterChange: (next) => setFilter(next),
      searchText: debouncedSearchText,
      onSearchTextChange: (next) => setSearchText(next),
      ...(blockSize !== undefined ? { blockSize } : {}),
      ...(maxCachedBlocks !== undefined ? { maxCachedBlocks } : {}),
      ...(blockLoadDebounceMs !== undefined ? { blockLoadDebounceMs } : {}),
      ...(maxConcurrentRequests !== undefined ? { maxConcurrentRequests } : {}),
      ...(prefetchAhead !== undefined ? { prefetchAhead } : {}),
    }),
    [
      gridId,
      rowId,
      wrappedLoadBlock,
      debouncedSort,
      debouncedFilter,
      debouncedSearchText,
      blockSize,
      maxCachedBlocks,
      blockLoadDebounceMs,
      maxConcurrentRequests,
      prefetchAhead,
    ],
  )

  const state = useMemo<UseServerInfiniteGridState>(
    () => ({ sort, filter, searchText, loading, error, totalRows }),
    [sort, filter, searchText, loading, error, totalRows],
  )

  const actions = useMemo<UseServerInfiniteGridActions>(
    () => ({ reload, invalidate, retryBlock, applyOptimisticEdit }),
    [reload, invalidate, retryBlock, applyOptimisticEdit],
  )

  return { props, state, actions }
}

/**
 * Re-export of the shared debounce primitive for parity with
 * `useServerPagedGrid`. New code should prefer the shared primitive.
 */
export const useDebouncedValue = useDebouncedValueInternal

/**
 * Pure helper exported for unit testing. Decides the initial
 * controlled-state values for the hook.
 */
export function resolveInitialServerInfiniteState(
  initial: UseServerInfiniteGridInitial | undefined,
): {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
} {
  return {
    sort: initial?.sort ?? [],
    filter: initial?.filter ?? null,
    searchText: initial?.search ?? "",
  }
}

/**
 * Pure helper exported for unit testing. Builds an optimistic-edit
 * `ServerRowPatch` with the `useServerInfiniteGrid:` mutation-ID
 * prefix so consumers can correlate hook-issued patches.
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
 * Pure helper exported for unit testing. Resolves the `totalRows`
 * value the hook should commit after a settled block result, mirroring
 * the existing `<BcServerGrid rowModel="infinite">` semantics:
 *
 * - explicit `result.totalRows` from the server wins;
 * - `result.hasMore === false` means the loaded blocks are everything,
 *   so total = blockStart + rows.length;
 * - otherwise carry the previous total forward (the server has not
 *   yet committed to a count).
 */
export function resolveServerInfiniteTotalRows(input: {
  previous: number | "unknown"
  result: { totalRows?: number; hasMore?: boolean; blockStart: number; rows: { length: number } }
}): number | "unknown" {
  if (typeof input.result.totalRows === "number") return input.result.totalRows
  if (input.result.hasMore === false) {
    return input.result.blockStart + input.result.rows.length
  }
  return input.previous
}
