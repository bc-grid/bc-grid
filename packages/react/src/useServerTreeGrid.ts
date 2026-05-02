import type {
  BcGridFilter,
  BcGridSort,
  BcServerGridApi,
  ColumnId,
  LoadServerTreeChildren,
  RowId,
  ServerGroupKey,
  ServerInvalidation,
  ServerLoadContext,
  ServerRowPatch,
  ServerTreeQuery,
  ServerTreeResult,
  ServerTreeRow,
} from "@bc-grid/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildOptimisticEditPatch as buildOptimisticEditPatchInternal,
  createServerLoadAbortError,
  isLoadAborted,
  useDebouncedValue as useDebouncedValueInternal,
  useMutationIdStream,
} from "./internal/useServerOrchestration"
import { readPersistedGridState } from "./persistence"
import type { BcServerTreeProps } from "./types"

const HOOK_MUTATION_PREFIX = "useServerTreeGrid"
const DEFAULT_DEBOUNCE_MS = 200

/**
 * Initial values the hook seeds into its controlled-state surface.
 * Tree mode adds an `expansion` set on top of the paged/infinite
 * controlled-state shape; root rows always render so the initial set
 * carries only the rowIds that should be expanded on mount.
 */
export interface UseServerTreeGridInitial {
  sort?: readonly BcGridSort[]
  filter?: BcGridFilter | null
  search?: string
  expansion?: ReadonlySet<RowId>
}

export interface UseServerTreeGridOptions<TRow> {
  /**
   * Persistence + diagnostics key. Threaded into the returned `props`
   * so `<BcGrid>`'s existing `usePersistedGridStateWriter` continues to
   * write under `bc-grid:<gridId>:*` for the dimensions it persists.
   */
  gridId: string
  /**
   * Lazy children loader. Called when an unloaded node is expanded.
   * Wrapped internally so the hook can surface `state.loading` /
   * `state.error` without the consumer mounting a second tracker.
   */
  loadChildren: LoadServerTreeChildren<TRow>
  /**
   * Optional separate loader for root rows. Defaults to `loadChildren`
   * when omitted (the underlying `<BcServerGrid rowModel="tree">`
   * convention).
   */
  loadRoots?: LoadServerTreeChildren<TRow>
  /**
   * Stable row identity. Forwarded to `<BcServerGrid>` as `rowId` and
   * used by `actions.applyOptimisticEdit` to address the patched row.
   */
  rowId: (row: TRow) => RowId
  /**
   * One-shot initial values for the controlled-state surface. The
   * `initial.expansion` set seeds the row IDs that should be expanded
   * on mount; the inner state hook lazily fetches children for those
   * rows after the initial root load settles.
   */
  initial?: UseServerTreeGridInitial
  /**
   * Debounce window (ms) applied before filter / search / sort changes
   * propagate into the server query. Default 200ms; set to `0` to
   * disable. Mirrors `useServerPagedGrid` and `useServerInfiniteGrid`.
   */
  debounceMs?: number
  /**
   * Consumer override for stable group-row identifiers. When supplied,
   * the hook applies the function to every group row in each
   * `loadChildren` / `loadRoots` result and stamps the returned
   * `RowId` onto `row.groupKey.rowId` before handing the result to
   * the model. The model layer then uses that id directly instead of
   * synthesising one from `viewKey + groupPath`.
   *
   * Required for selection algebra against group rows (selecting a
   * group row needs a stable id), focus retention across re-render,
   * and persisted expansion state. Surfaced by the bsncraft
   * 2026-05-03 review.
   *
   * `path` is the full ancestor chain ending in `key`. Implementations
   * typically join the path columnId/value pairs with a delimiter.
   */
  groupRowId?: (key: ServerGroupKey, path: readonly ServerGroupKey[]) => RowId
  /**
   * Persistence target. `"localStorage"` reads `sort` and `filter`
   * from `bc-grid:<gridId>:*` on mount so the hook's controlled state
   * matches what `<BcGrid>` would have hydrated, then continues
   * writing through the inner `<BcGrid>`'s
   * `usePersistedGridStateWriter` (always active when `gridId` is
   * supplied).
   *
   * Persistence is best-effort: SSR, sandboxed iframes, and storage
   * quota errors are silently ignored — the hook falls through to
   * `initial` and built-in empty values.
   *
   * `searchText` and `expansion` persistence is **not yet wired** —
   * they are not in the `PersistedGridState` shape that
   * `<BcGrid>`'s persistence layer writes. Adding them is queued as a
   * v0.6 follow-up.
   *
   * `"url"` is reserved for v0.6.
   */
  persistTo?: "localStorage" | null
  /**
   * Children fetched per `loadChildren` / `loadRoots` request. Default
   * 100. Forwarded to `<BcServerGrid rowModel="tree">` as
   * `childCount`. Lower values reduce per-fetch payload at the cost
   * of more round-trips for groups with many children.
   */
  pageSize?: number
  /**
   * LRU cap on loaded tree blocks. Forwarded to `<BcServerGrid>` as
   * `maxCachedBlocks`. The model evicts the least-recently-used
   * loaded blocks after each successful tree fetch when this is set,
   * so memory stays bounded for users who expand many groups across
   * deep trees. Omit (default) for unbounded retention — appropriate
   * when the tree fits comfortably in memory.
   */
  cacheLimit?: number
  /**
   * Optional pre-seed for the chrome's known root child count.
   * Forwarded to `<BcServerGrid>` as `initialRootChildCount`. The
   * scrollbar / status-bar / "Loading X rows" affordances render at
   * the right size before the first `loadChildren` resolves; once
   * the first fetch settles, the actual `result.totalChildCount` (or
   * visible row count) takes over.
   *
   * **Does not skip the first fetch** — the model still needs the
   * actual root rows. The "saves a round-trip" framing applies only
   * when the consumer's server architecture splits count from rows;
   * `bc-grid` does not assume that split.
   */
  rootChildCount?: number
}

export interface UseServerTreeGridState {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  expansion: ReadonlySet<RowId>
  /**
   * `true` while at least one root or child load is in flight. Per-
   * node loading state lives in `<BcServerGrid>`'s internal tree
   * snapshot; consumers that need per-row loading affordances should
   * read it from `apiRef.current?.getServerRowModelState()` or via
   * the cell renderer's `rowState`.
   */
  loading: boolean
  /**
   * Last error surfaced by a wrapped `loadChildren` call (root or
   * child). Cleared when the next load resolves successfully.
   */
  error: unknown
}

export interface UseServerTreeGridActions {
  /**
   * Re-fire the active tree fetch flow (purges the cache and reloads
   * roots). Wraps `apiRef.current?.refreshServerRows({ purge: true })`.
   */
  reload: () => void
  /**
   * Invalidate a specific scope without rebuilding the entire cache.
   * Wraps `apiRef.current?.invalidateServerRows`.
   */
  invalidate: (invalidation: ServerInvalidation) => void
  /**
   * Add a rowId to the expansion set. The inner state hook will
   * lazily fetch children for the newly expanded row if its children
   * are not already loaded.
   */
  expandRow: (rowId: RowId) => void
  /**
   * Remove a rowId from the expansion set. Children stay cached so a
   * later re-expand renders synchronously.
   */
  collapseRow: (rowId: RowId) => void
  /**
   * Queue an optimistic edit overlay against the server row model
   * cache. Returns the deterministic mutation ID
   * (`useServerTreeGrid:N`) so consumers can correlate hook-issued
   * patches in their `onServerRowMutation` settle handler. For
   * recursive edits across a parent and its descendants, call this
   * once per affected row; the hook does not perform automatic
   * descendant traversal.
   */
  applyOptimisticEdit: (input: { rowId: RowId; changes: Record<ColumnId, unknown> }) => string
}

/**
 * Spread-ready props for `<BcServerGrid rowModel="tree">`. Excludes
 * `columns` — the consumer still owns column definitions at the JSX
 * site so the hook does not constrain column generics or rendering.
 *
 * Apply with:
 *
 * ```tsx
 * <BcServerGrid {...grid.props} columns={columns} />
 * ```
 */
export type UseServerTreeGridBoundProps<TRow> = Omit<BcServerTreeProps<TRow>, "columns">

export interface UseServerTreeGridResult<TRow> {
  props: UseServerTreeGridBoundProps<TRow>
  state: UseServerTreeGridState
  actions: UseServerTreeGridActions
}

/**
 * Turnkey orchestration hook for server-tree (lazy-children) grids.
 * Companion to `useServerPagedGrid` (#363) and `useServerInfiniteGrid`
 * (#368); same `{ props, state, actions }` shape adapted for the tree
 * row model. Audit-2026-05 P0-6 follow-up — closes the v0.5 server-side
 * parity story.
 *
 * The hook composes `<BcServerGrid rowModel="tree">`'s existing
 * lazy-children fetch + per-row stale-response gate rather than
 * duplicating them; it adds the consumer-facing controlled-state
 * plumbing (sort / filter / searchText / expansion), debounce,
 * optimistic-edit ID stream, and a loading/error surface that
 * surfaces through `state` instead of disappearing into the loading
 * overlay.
 *
 * Example:
 *
 * ```tsx
 * const grid = useServerTreeGrid({
 *   gridId: "production.bom",
 *   loadChildren,
 *   rowId: (row) => row.id,
 * })
 * return (
 *   <BcServerGrid<BomLine> {...grid.props} columns={columns} />
 * )
 * ```
 */
export function useServerTreeGrid<TRow>(
  opts: UseServerTreeGridOptions<TRow>,
): UseServerTreeGridResult<TRow> {
  const {
    gridId,
    loadChildren,
    loadRoots,
    rowId,
    initial,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    groupRowId,
    persistTo,
    pageSize,
    cacheLimit,
    rootChildCount,
  } = opts

  // Hydrate sort / filter from `bc-grid:<gridId>:*` localStorage on
  // mount when the consumer opted into persistence. `<BcGrid>`'s
  // existing `usePersistedGridStateWriter` already handles writes
  // through the props pipeline; the read step is what's missing
  // because the hook owns controlled state and would otherwise
  // override the persisted values with built-in defaults.
  const persistedGridState = useMemo(
    () => (persistTo === "localStorage" && gridId ? readPersistedGridState(gridId) : null),
    [persistTo, gridId],
  )

  const apiRef = useRef<BcServerGridApi<TRow> | null>(null)
  const [sort, setSort] = useState<readonly BcGridSort[]>(
    () => initial?.sort ?? persistedGridState?.sort ?? [],
  )
  const [filter, setFilter] = useState<BcGridFilter | null>(
    () => initial?.filter ?? persistedGridState?.filter ?? null,
  )
  const [searchText, setSearchText] = useState<string>(() => initial?.search ?? "")
  const [expansion, setExpansion] = useState<ReadonlySet<RowId>>(
    () => initial?.expansion ?? new Set<RowId>(),
  )

  const debouncedSort = useDebouncedValueInternal(sort, debounceMs)
  const debouncedFilter = useDebouncedValueInternal(filter, debounceMs)
  const debouncedSearchText = useDebouncedValueInternal(searchText, debounceMs)

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<unknown>(null)

  const inFlightCountRef = useRef(0)
  const loadChildrenRef = useRef(loadChildren)
  const loadRootsRef = useRef(loadRoots)
  const groupRowIdRef = useRef(groupRowId)
  useEffect(() => {
    loadChildrenRef.current = loadChildren
  }, [loadChildren])
  useEffect(() => {
    loadRootsRef.current = loadRoots
  }, [loadRoots])
  useEffect(() => {
    groupRowIdRef.current = groupRowId
  }, [groupRowId])

  const wrappedLoadChildren = useCallback<LoadServerTreeChildren<TRow>>(
    async (query: ServerTreeQuery, ctx: ServerLoadContext) => {
      inFlightCountRef.current += 1
      setLoading(true)
      setError(null)
      try {
        const result: ServerTreeResult<TRow> = await loadChildrenRef.current(query, ctx)
        if (isLoadAborted(ctx.signal)) {
          throw createServerLoadAbortError()
        }
        return applyGroupRowIdOverride(result, groupRowIdRef.current)
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

  const wrappedLoadRoots = useCallback<LoadServerTreeChildren<TRow>>(
    async (query: ServerTreeQuery, ctx: ServerLoadContext) => {
      const loader = loadRootsRef.current
      if (!loader) {
        // Fall through to wrappedLoadChildren so the loadChildren
        // wrapper's loading/error surface stays the single source of
        // truth even when the consumer doesn't supply `loadRoots`.
        return wrappedLoadChildren(query, ctx)
      }
      inFlightCountRef.current += 1
      setLoading(true)
      setError(null)
      try {
        const result = await loader(query, ctx)
        if (isLoadAborted(ctx.signal)) {
          throw createServerLoadAbortError()
        }
        return applyGroupRowIdOverride(result, groupRowIdRef.current)
      } catch (e) {
        if (isLoadAborted(ctx.signal)) throw e
        setError(e)
        throw e
      } finally {
        inFlightCountRef.current -= 1
        if (inFlightCountRef.current <= 0) setLoading(false)
      }
    },
    [wrappedLoadChildren],
  )

  const reload = useCallback(() => {
    apiRef.current?.refreshServerRows({ purge: true })
  }, [])

  const invalidate = useCallback((invalidation: ServerInvalidation) => {
    apiRef.current?.invalidateServerRows(invalidation)
  }, [])

  const expandRow = useCallback((targetRowId: RowId) => {
    setExpansion((prev) => addRowToExpansion(prev, targetRowId))
  }, [])

  const collapseRow = useCallback((targetRowId: RowId) => {
    setExpansion((prev) => removeRowFromExpansion(prev, targetRowId))
  }, [])

  const handleExpansionChange = useCallback((next: ReadonlySet<RowId>) => {
    setExpansion(next)
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

  const props = useMemo<UseServerTreeGridBoundProps<TRow>>(
    () => ({
      apiRef,
      gridId,
      rowId,
      rowModel: "tree" as const,
      loadChildren: wrappedLoadChildren,
      ...(loadRoots !== undefined ? { loadRoots: wrappedLoadRoots } : {}),
      sort: debouncedSort,
      onSortChange: (next) => setSort(next),
      filter: debouncedFilter,
      onFilterChange: (next) => setFilter(next),
      searchText: debouncedSearchText,
      onSearchTextChange: (next) => setSearchText(next),
      expansion,
      onExpansionChange: handleExpansionChange,
      ...(pageSize !== undefined ? { childCount: pageSize } : {}),
      ...(cacheLimit !== undefined ? { maxCachedBlocks: cacheLimit } : {}),
      ...(rootChildCount !== undefined ? { initialRootChildCount: rootChildCount } : {}),
    }),
    [
      gridId,
      rowId,
      wrappedLoadChildren,
      loadRoots,
      wrappedLoadRoots,
      debouncedSort,
      debouncedFilter,
      debouncedSearchText,
      expansion,
      handleExpansionChange,
      pageSize,
      cacheLimit,
      rootChildCount,
    ],
  )

  const state = useMemo<UseServerTreeGridState>(
    () => ({ sort, filter, searchText, expansion, loading, error }),
    [sort, filter, searchText, expansion, loading, error],
  )

  const actions = useMemo<UseServerTreeGridActions>(
    () => ({ reload, invalidate, expandRow, collapseRow, applyOptimisticEdit }),
    [reload, invalidate, expandRow, collapseRow, applyOptimisticEdit],
  )

  return { props, state, actions }
}

/**
 * Re-export of the shared debounce primitive for parity with
 * `useServerPagedGrid` and `useServerInfiniteGrid`. New code should
 * prefer the shared primitive from `internal/useServerOrchestration`.
 */
export const useDebouncedValue = useDebouncedValueInternal

/**
 * Pure helper exported for unit testing. Decides the initial
 * controlled-state values for the hook.
 */
export function resolveInitialServerTreeState(initial: UseServerTreeGridInitial | undefined): {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  expansion: ReadonlySet<RowId>
} {
  return {
    sort: initial?.sort ?? [],
    filter: initial?.filter ?? null,
    searchText: initial?.search ?? "",
    expansion: initial?.expansion ?? new Set<RowId>(),
  }
}

/**
 * Pure helper exported for unit testing. Returns the next expansion
 * set after adding `rowId`. Idempotent — if `rowId` is already
 * expanded the same set reference is returned so React state
 * comparisons short-circuit.
 */
export function addRowToExpansion(prev: ReadonlySet<RowId>, rowId: RowId): ReadonlySet<RowId> {
  if (prev.has(rowId)) return prev
  const next = new Set(prev)
  next.add(rowId)
  return next
}

/**
 * Pure helper exported for unit testing. Returns the next expansion
 * set after removing `rowId`. Idempotent — if `rowId` is already
 * collapsed the same set reference is returned so React state
 * comparisons short-circuit.
 */
export function removeRowFromExpansion(prev: ReadonlySet<RowId>, rowId: RowId): ReadonlySet<RowId> {
  if (!prev.has(rowId)) return prev
  const next = new Set(prev)
  next.delete(rowId)
  return next
}

/**
 * Pure helper exported for unit testing. Builds an optimistic-edit
 * `ServerRowPatch` with the `useServerTreeGrid:` mutation-ID prefix
 * so consumers can correlate hook-issued patches.
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
 * Pure helper exported for unit testing. Walks every group row in a
 * `ServerTreeResult` and stamps `row.groupKey.rowId` with the value
 * returned by the consumer-supplied `groupRowId` callback. Leaf rows
 * and group rows that already carry an explicit `rowId` are left
 * untouched so consumer-set ids continue to win.
 *
 * Returns the original result reference when no override was supplied
 * (the common case) so React equality checks don't see a spurious
 * change.
 */
export function applyGroupRowIdOverride<TRow>(
  result: ServerTreeResult<TRow>,
  groupRowId: ((key: ServerGroupKey, path: readonly ServerGroupKey[]) => RowId) | undefined,
): ServerTreeResult<TRow> {
  if (!groupRowId) return result
  let mutated = false
  const nextRows = result.rows.map((row): ServerTreeRow<TRow> => {
    if (row.kind !== "group" || !row.groupKey || row.rowId || row.groupKey.rowId) return row
    const path = [...result.groupPath, row.groupKey]
    const id = groupRowId(row.groupKey, path)
    mutated = true
    return { ...row, groupKey: { ...row.groupKey, rowId: id } }
  })
  return mutated ? { ...result, rows: nextRows } : result
}
