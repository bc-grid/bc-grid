import type {
  BcGridFilter,
  BcGridSort,
  BcPaginationState,
  BcScrollOptions,
  BcServerGridApi,
  ColumnId,
  LoadServerPage,
  RowId,
  ServerLoadContext,
  ServerPagedQuery,
  ServerPagedResult,
  ServerRowPatch,
  ServerViewState,
} from "@bc-grid/core"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  buildOptimisticEditPatch as buildOptimisticEditPatchInternal,
  createServerLoadAbortError,
  isLoadAborted,
  useDebouncedValue as useDebouncedValueInternal,
  useMutationIdStream,
} from "./internal/useServerOrchestration"
import type { BcServerPagedProps } from "./types"

const HOOK_MUTATION_PREFIX = "useServerPagedGrid"

/**
 * Initial values the hook seeds into its controlled-state surface. All
 * fields are optional; omitted fields fall through to built-in defaults
 * (empty sort, null filter, empty search text, page 0, pageSize 100).
 *
 * `search` matches the spec naming for the consumer API; the hook
 * threads it into `<BcGrid>` as `searchText` per the existing
 * `BcGridStateProps` contract.
 */
export interface UseServerPagedGridInitial {
  sort?: readonly BcGridSort[]
  filter?: BcGridFilter | null
  search?: string
  page?: number
  pageSize?: number
}

export interface UseServerPagedGridOptions<TRow> {
  /**
   * Persistence + diagnostics key. Threaded into the returned `props`
   * so `<BcGrid>`'s existing `usePersistedGridStateWriter` continues to
   * write under `bc-grid:<gridId>:*` for the dimensions it persists.
   */
  gridId: string
  /**
   * Server page loader. Wrapped internally so the hook can surface
   * `state.loading` / `state.error` without the consumer mounting a
   * second tracker.
   */
  loadPage: LoadServerPage<TRow>
  /**
   * Stable row identity. Forwarded to `<BcServerGrid>` as `rowId` and
   * also used by `actions.applyOptimisticEdit` to address the patched
   * row.
   */
  rowId: (row: TRow) => RowId
  /**
   * One-shot initial values for the controlled-state surface. Persisted
   * values from `gridId` localStorage win over `initial` for the
   * dimensions that persist (`<BcGrid>` reads them from storage).
   */
  initial?: UseServerPagedGridInitial
  /**
   * Debounce window (ms) applied before filter / search / sort changes
   * propagate into the server query. Default 200ms. Set to `0` to
   * disable. The debounce affects only the value handed to
   * `<BcServerGrid>`; chrome controls update immediately so the user
   * never sees a typed character lag the input.
   */
  debounceMs?: number
  /**
   * Selects which output the hook populates. Per
   * `docs/design/server-grid-hooks-dual-output-rfc.md §3.1`.
   *
   *   - `"server"` (default): existing behaviour. The hook returns
   *     `serverProps` (also aliased as `props` for backwards compat)
   *     and DOES NOT orchestrate the loader internally — the consumer
   *     mounts `<BcServerGrid {...result.serverProps}>` and that
   *     component owns the orchestration. `result.bound.data` is
   *     empty.
   *   - `"bound"`: the hook orchestrates the loader internally so
   *     `result.bound.data` is populated. The consumer mounts
   *     `<BcGrid {...result.bound}>` directly (bsncraft case — the
   *     consumer wraps `<BcGrid>` in their own chrome and never
   *     mounts `<BcServerGrid>`). DO NOT also mount
   *     `<BcServerGrid {...result.serverProps}>` — both would dispatch
   *     the loader, doubling network traffic.
   *
   * v0.6 ships paged dual-output. Marker-prop dedup (RFC §5) +
   * infinite/tree dual-output land in v0.6.x follow-ups.
   */
  outputs?: "server" | "bound"
}

export interface UseServerPagedGridState<TRow> {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  page: number
  pageSize: number
  loading: boolean
  error: unknown
  /**
   * Last successful server result, or `null` before the first response.
   * Useful for consumers that want to read totalRows without going
   * through the apiRef.
   */
  lastResult: ServerPagedResult<TRow> | null
}

export interface UseServerPagedGridActions {
  /**
   * Re-fire the active server query. Does not purge the cache; the
   * consumer can call `props.apiRef.current?.refreshServerRows({ purge: true })`
   * directly if they need a hard reset.
   */
  reload: () => void
  setPage: (next: number) => void
  setPageSize: (next: number) => void
  /**
   * Queue an optimistic edit overlay against the server row model
   * cache. Wraps `apiRef.current?.queueServerRowMutation`; the caller
   * is responsible for settling the mutation via the standard
   * `<BcServerGrid>` `onServerRowMutation` adapter.
   */
  applyOptimisticEdit: (input: { rowId: RowId; changes: Record<ColumnId, unknown> }) => string
  /**
   * Convenience wrapper around `apiRef.current?.scrollToServerCell`.
   * Resolves `{ scrolled: false }` if the apiRef is not yet populated;
   * otherwise delegates to the API (which handles the loaded /
   * navigate-and-await paths). Use this from search → ArrowDown,
   * save-and-next, and scroll-to-error workflows.
   */
  scrollToCell: (
    rowId: RowId,
    columnId: ColumnId,
    opts?: BcScrollOptions & { pageIndex?: number },
  ) => Promise<{ scrolled: boolean }>
}

/**
 * Spread-ready props for `<BcServerGrid rowModel="paged">`. Excludes
 * `columns` — the consumer still owns column definitions at the JSX
 * site so the hook does not constrain column generics or rendering.
 *
 * Apply with:
 *
 * ```tsx
 * <BcServerGrid {...grid.props} columns={columns} />
 * ```
 */
export type UseServerPagedGridBoundProps<TRow> = Omit<BcServerPagedProps<TRow>, "columns">

/**
 * `<BcGrid>`-shaped bound output for consumers wrapping plain
 * `<BcGrid>` (not `<BcServerGrid>`). Per
 * `docs/design/server-grid-hooks-dual-output-rfc.md §3.2`. The hook
 * orchestrates the loader internally so `data` is populated without
 * the consumer mounting `<BcServerGrid>`.
 *
 * **Don't mount `<BcServerGrid {...result.serverProps}>` AND use
 * `result.bound` simultaneously** — both would dispatch the loader,
 * doubling network traffic. Pick ONE output per hook instance:
 *
 *   - `bound` — for plain `<BcGrid>` consumers (bsncraft case).
 *   - `serverProps` (alias `props`) — for `<BcServerGrid>` consumers.
 *
 * v0.6 ships forward-only paged dual-output. Marker-prop dedup
 * (RFC §5) + infinite/tree dual-output land in v0.6.x follow-ups.
 */
export interface UseServerPagedGridBoundOutput<TRow> {
  rowId: (row: TRow) => RowId
  data: readonly TRow[]
  loading: boolean
  errorOverlay: ReactNode | undefined
  rowProcessingMode: "manual"
  sort: readonly BcGridSort[]
  onSortChange: (next: readonly BcGridSort[]) => void
  filter: BcGridFilter | null
  onFilterChange: (next: BcGridFilter | null) => void
  searchText: string
  onSearchTextChange: (next: string) => void
  pagination: BcPaginationState
  onPaginationChange: (next: BcPaginationState) => void
}

export interface UseServerPagedGridResult<TRow> {
  /**
   * `<BcServerGrid>`-shaped output. Spread into
   * `<BcServerGrid {...result.serverProps} columns={…} />`. Mirrors
   * the previous `props` field; `props` remains as a deprecated
   * alias for v0.6.0 backwards compatibility (removed in v0.7).
   */
  serverProps: UseServerPagedGridBoundProps<TRow>
  /**
   * `<BcGrid>`-shaped output. Spread into
   * `<BcGrid {...result.bound} columns={…} />` when the consumer
   * wraps `<BcGrid>` directly (bsncraft case). The hook orchestrates
   * the loader internally; do NOT mount `<BcServerGrid>` with
   * `serverProps` while also using `bound` — both would fire the
   * loader, doubling network traffic.
   */
  bound: UseServerPagedGridBoundOutput<TRow>
  /**
   * @deprecated Renamed to `serverProps` in v0.6.0. The alias stays
   * for one release; remove in v0.7. New code should use
   * `serverProps` directly.
   */
  props: UseServerPagedGridBoundProps<TRow>
  state: UseServerPagedGridState<TRow>
  actions: UseServerPagedGridActions
}

const DEFAULT_PAGE_SIZE = 100
const DEFAULT_DEBOUNCE_MS = 200

/**
 * Turnkey orchestration hook for server-paged grids. Subsumes the
 * 9-`useState` consumer state machine documented in audit-2026-05
 * P0-6 / synthesis sprint plan: request-id flow, stale-response
 * rejection, debounce, page reset on view change, optimistic edits,
 * and an error/reload surface — all handled by the hook so the
 * consumer just spreads `props` into `<BcServerGrid rowModel="paged">`.
 *
 * The hook composes existing bc-grid surfaces rather than duplicating
 * them: `<BcServerGrid>` already owns request-id flow and stale-
 * response rejection at the model layer; this hook adds the consumer-
 * facing controlled-state plumbing, debounce, and a loading/error
 * surface that surfaces through `state` instead of disappearing into
 * the loading overlay.
 *
 * Example:
 *
 * ```tsx
 * const grid = useServerPagedGrid({
 *   gridId: "ar.customers",
 *   loadPage,
 *   rowId: (row) => row.id,
 * })
 * return (
 *   <BcServerGrid<Customer> {...grid.props} columns={columns} />
 * )
 * ```
 */
export function useServerPagedGrid<TRow>(
  opts: UseServerPagedGridOptions<TRow>,
): UseServerPagedGridResult<TRow> {
  const {
    gridId,
    loadPage,
    rowId,
    initial,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    outputs = "server",
  } = opts

  const apiRef = useRef<BcServerGridApi<TRow> | null>(null)
  const [sort, setSort] = useState<readonly BcGridSort[]>(() => initial?.sort ?? [])
  const [filter, setFilter] = useState<BcGridFilter | null>(() => initial?.filter ?? null)
  const [searchText, setSearchText] = useState<string>(() => initial?.search ?? "")
  const [page, setPage] = useState<number>(() => initial?.page ?? 0)
  const [pageSize, setPageSize] = useState<number>(() => initial?.pageSize ?? DEFAULT_PAGE_SIZE)

  // Debounced view-defining state. The non-debounced values feed the
  // consumer-facing chrome controls; the debounced values feed
  // `<BcServerGrid>` so the server query waits for typing to settle.
  const debouncedSort = useDebouncedValue(sort, debounceMs)
  const debouncedFilter = useDebouncedValue(filter, debounceMs)
  const debouncedSearchText = useDebouncedValue(searchText, debounceMs)

  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<unknown>(null)
  const [lastResult, setLastResult] = useState<ServerPagedResult<TRow> | null>(null)

  // Wrap loadPage so the hook can surface loading/error without
  // racing the inner model's own request-id state. The model already
  // dedupes by blockKey; we only forward the latest result that the
  // model decides to apply, by tracking the request through the
  // wrapped callback. The model's internal `isActiveServerPagedResponse`
  // gate enforces "only the latest result wins".
  const loadPageRef = useRef(loadPage)
  useEffect(() => {
    loadPageRef.current = loadPage
  }, [loadPage])

  const wrappedLoadPage = useCallback<LoadServerPage<TRow>>(
    async (query: ServerPagedQuery, ctx: ServerLoadContext) => {
      setLoading(true)
      setError(null)
      try {
        const result = await loadPageRef.current(query, ctx)
        // Only record the result + clear loading if the request was
        // not aborted by a newer query. The model's blockKey gate
        // drops stale results from the cache; the abort signal is the
        // signal we should also drop the loading=false update.
        if (isLoadAborted(ctx.signal)) {
          throw createServerLoadAbortError()
        }
        setLastResult(result)
        setLoading(false)
        return result
      } catch (e) {
        if (isLoadAborted(ctx.signal)) {
          // A newer request superseded this one. The newer request
          // owns the loading transition; do not clear loading here.
          throw e
        }
        setError(e)
        setLoading(false)
        throw e
      }
    },
    [],
  )

  // Page reset on view-defining change. `<BcServerGrid>` already
  // resets the requested page to 0 when the viewKey changes, but it
  // does so against its own internal page state. The hook owns page
  // here so we mirror that reset locally.
  // biome-ignore lint/correctness/useExhaustiveDependencies: debouncedSort/Filter/SearchText are re-run triggers, not values read inside the effect.
  useEffect(() => {
    setPage((prev) => (prev === 0 ? prev : 0))
  }, [debouncedSort, debouncedFilter, debouncedSearchText])

  // Bound-output orchestration loop (worker1 v06 dual-output IMPL,
  // RFC §3-§5). When `outputs === "bound"`, the hook fires the
  // wrapped loader directly on every view-defining change so
  // `bound.data` is populated for consumers wrapping `<BcGrid>`
  // (not `<BcServerGrid>`). Cancels the previous in-flight request
  // via AbortController on each re-fire so stale results never
  // overwrite the latest `lastResult`. When `outputs === "server"`
  // (default), this effect is a no-op — orchestration stays inside
  // `<BcServerGrid>` per the existing contract.
  const boundAbortRef = useRef<AbortController | null>(null)
  const boundRequestIdRef = useRef(0)
  const boundActive = outputs === "bound"
  // biome-ignore lint/correctness/useExhaustiveDependencies: wrappedLoadPage is stable; orchestration triggers re-fire on view-defining state.
  useEffect(() => {
    if (!boundActive) return
    boundAbortRef.current?.abort()
    const controller = new AbortController()
    boundAbortRef.current = controller
    boundRequestIdRef.current += 1
    const requestId = `bound-${boundRequestIdRef.current}`
    const view: ServerViewState = {
      sort: debouncedSort.map((s) => ({ columnId: s.columnId, direction: s.direction })),
      ...(debouncedFilter !== null ? { filter: debouncedFilter } : {}),
      search: debouncedSearchText,
      groupBy: [],
      visibleColumns: [],
    }
    const query: ServerPagedQuery = {
      mode: "paged",
      pageIndex: page,
      pageSize,
      view,
      requestId,
    }
    void wrappedLoadPage(query, { signal: controller.signal }).catch(() => undefined)
    return () => controller.abort()
  }, [
    boundActive,
    debouncedSort,
    debouncedFilter,
    debouncedSearchText,
    page,
    pageSize,
    wrappedLoadPage,
  ])

  const handlePaginationChange = useCallback((next: { page: number; pageSize: number }) => {
    setPage(next.page)
    setPageSize(next.pageSize)
  }, [])

  const reload = useCallback(() => {
    apiRef.current?.refreshServerRows()
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
      opts?: BcScrollOptions & { pageIndex?: number },
    ): Promise<{ scrolled: boolean }> =>
      apiRef.current?.scrollToServerCell(cellRowId, columnId, opts) ??
      Promise.resolve({ scrolled: false }),
    [],
  )

  const serverProps = useMemo<UseServerPagedGridBoundProps<TRow>>(
    () => ({
      apiRef,
      gridId,
      rowId,
      rowModel: "paged" as const,
      loadPage: wrappedLoadPage,
      sort: debouncedSort,
      onSortChange: (next) => setSort(next),
      filter: debouncedFilter,
      onFilterChange: (next) => setFilter(next),
      searchText: debouncedSearchText,
      onSearchTextChange: (next) => setSearchText(next),
      page,
      pageSize,
      onPaginationChange: handlePaginationChange,
    }),
    [
      gridId,
      rowId,
      wrappedLoadPage,
      debouncedSort,
      debouncedFilter,
      debouncedSearchText,
      page,
      pageSize,
      handlePaginationChange,
    ],
  )

  // `<BcGrid>`-shaped bound output (worker1 v06 dual-output IMPL).
  // Populated whether `outputs === "bound"` or `"server"` (the
  // shape is harmless when not consumed); only the orchestration
  // loop above is gated on `boundActive`. `data` reads from
  // `lastResult.rows` which the wrapped loader updates whether it
  // was called from `<BcServerGrid>` (server mode) or the internal
  // orchestration loop (bound mode). `errorOverlay` is set only
  // when an error is present so the consumer's own
  // `BcGridProps.errorOverlay` slot is forwarded automatically.
  const bound = useMemo<UseServerPagedGridBoundOutput<TRow>>(
    () => ({
      rowId,
      data: lastResult?.rows ?? [],
      loading,
      errorOverlay: error != null ? defaultBoundErrorMessage(error) : undefined,
      rowProcessingMode: "manual" as const,
      sort: debouncedSort,
      onSortChange: (next) => setSort(next),
      filter: debouncedFilter,
      onFilterChange: (next) => setFilter(next),
      searchText: debouncedSearchText,
      onSearchTextChange: (next) => setSearchText(next),
      pagination: { page, pageSize },
      onPaginationChange: handlePaginationChange,
    }),
    [
      rowId,
      lastResult,
      loading,
      error,
      debouncedSort,
      debouncedFilter,
      debouncedSearchText,
      page,
      pageSize,
      handlePaginationChange,
    ],
  )

  const state = useMemo<UseServerPagedGridState<TRow>>(
    () => ({ sort, filter, searchText, page, pageSize, loading, error, lastResult }),
    [sort, filter, searchText, page, pageSize, loading, error, lastResult],
  )

  const actions = useMemo<UseServerPagedGridActions>(
    () => ({ reload, setPage, setPageSize, applyOptimisticEdit, scrollToCell }),
    [reload, applyOptimisticEdit, scrollToCell],
  )

  return { serverProps, bound, props: serverProps, state, actions }
}

/**
 * Minimal default error message for the `bound.errorOverlay` slot
 * when the consumer hasn't overridden it. Mirrors the
 * `serverErrorMessage` helper served by `<BcServerGrid>` (#468) but
 * avoids coupling the hook to the server-grid component. Consumers
 * who want richer chrome should ignore `bound.errorOverlay` and
 * render their own `errorOverlay` adjacent to the bound spread:
 *
 * ```tsx
 * <BcGrid {...grid.bound} errorOverlay={grid.state.error
 *   ? <MyRichErrorOverlay error={grid.state.error} retry={grid.actions.reload} />
 *   : undefined} />
 * ```
 *
 * Exported for unit testing.
 */
export function defaultBoundErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return `Failed to load. ${error.message}`
  return "Failed to load."
}

/**
 * Re-export of the shared debounce primitive. Kept on
 * `useServerPagedGrid` for consumers who want it without reaching into
 * `internal/`. New code should import the shared primitive from a
 * future `@bc-grid/react` public surface if it grows beyond the
 * server-grid hooks.
 */
export const useDebouncedValue = useDebouncedValueInternal

/**
 * Pure helper exported for unit testing. Decides the initial controlled-
 * state values for the hook, blending `initial` (consumer-supplied)
 * with built-in defaults (empty sort/filter, empty searchText, page 0,
 * pageSize 100).
 *
 * Persistence is consumer-owned; persisted values are not blended here
 * because the inner `<BcGrid>` already reads them from `gridId`
 * localStorage on mount and emits them through `onPersistedStateRead`.
 * Plumbing them through twice would race storage writes.
 */
export function resolveInitialServerPagedState(initial: UseServerPagedGridInitial | undefined): {
  sort: readonly BcGridSort[]
  filter: BcGridFilter | null
  searchText: string
  page: number
  pageSize: number
} {
  return {
    sort: initial?.sort ?? [],
    filter: initial?.filter ?? null,
    searchText: initial?.search ?? "",
    page: Number.isFinite(initial?.page) ? Math.max(0, Math.floor(initial?.page ?? 0)) : 0,
    pageSize: Number.isFinite(initial?.pageSize)
      ? Math.max(1, Math.floor(initial?.pageSize ?? DEFAULT_PAGE_SIZE))
      : DEFAULT_PAGE_SIZE,
  }
}

/**
 * Pure helper exported for unit testing. Computes the next page
 * after a view-defining change. Mirrors `<BcServerGrid>`'s internal
 * `shouldResetServerPagedPage` contract: changing sort / filter /
 * search resets to page 0; changing page index alone is preserved.
 */
export function resolveServerPagedPageAfterViewChange(input: {
  previousViewKey: string
  nextViewKey: string
  page: number
}): number {
  if (input.previousViewKey === input.nextViewKey) return input.page
  return 0
}

/**
 * Pure helper exported for unit testing. Builds an optimistic-edit
 * `ServerRowPatch` with the `useServerPagedGrid:` mutation-ID prefix
 * so consumers can correlate hook-issued patches in their telemetry
 * or `onServerRowMutation` settle handler. Thin wrapper around the
 * shared `internal/useServerOrchestration` builder for test stability.
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
