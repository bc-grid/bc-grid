import type {
  BcGridFilter,
  BcGridSort,
  BcPaginationState,
  BcSelection,
  BcServerGridApi,
  ColumnId,
  RowId,
  ServerBlockKey,
  ServerBlockResult,
  ServerCacheBlock,
  ServerInvalidation,
  ServerPagedResult,
  ServerRowModelMode,
  ServerRowModelState,
  ServerSelection,
  ServerViewState,
} from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BcGrid, useBcGridApi } from "./grid"
import { assignRef, createEmptySelection, hasProp } from "./gridInternals"
import type { BcGridProps, BcServerGridProps } from "./types"

const DEFAULT_SERVER_PAGE_SIZE = 100
const DEFAULT_SERVER_BLOCK_SIZE = 100

interface PagedServerState<TRow> {
  error: unknown
  getModelState: () => ServerRowModelState<TRow>
  handleFilterChange: (next: BcGridFilter, prev: BcGridFilter) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  invalidate: (invalidation: ServerInvalidation) => void
  loading: boolean
  refresh: (opts?: { purge?: boolean }) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  rows: readonly TRow[]
  rowCount: number | "unknown"
  view: ServerViewState
}

interface InfiniteServerState<TRow> {
  error: unknown
  getModelState: () => ServerRowModelState<TRow>
  handleFilterChange: (next: BcGridFilter, prev: BcGridFilter) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  handleVisibleRowRangeChange: (range: { startIndex: number; endIndex: number }) => void
  invalidate: (invalidation: ServerInvalidation) => void
  loading: boolean
  refresh: (opts?: { purge?: boolean }) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  rows: readonly TRow[]
  rowCount: number | "unknown"
  view: ServerViewState
}

export function BcServerGrid<TRow>(props: BcServerGridProps<TRow>): ReactNode {
  const gridApiRef = useBcGridApi<TRow>()
  const externalApiRef = props.apiRef
  const visibleColumns = useMemo(
    () =>
      props.columns
        .filter((column) => !column.hidden)
        .map((column, index) => column.columnId ?? column.field ?? `column-${index}`),
    [props.columns],
  )
  const paged = usePagedServerState(props, visibleColumns)
  const infinite = useInfiniteServerState(props, visibleColumns)

  const serverApi = useMemo<BcServerGridApi<TRow>>(() => {
    const mode = props.rowModel

    return {
      scrollToRow(rowId, opts) {
        gridApiRef.current?.scrollToRow(rowId, opts)
      },
      scrollToCell(position, opts) {
        gridApiRef.current?.scrollToCell(position, opts)
      },
      focusCell(position) {
        gridApiRef.current?.focusCell(position)
      },
      isCellVisible(position) {
        return gridApiRef.current?.isCellVisible(position) ?? false
      },
      getRowById(rowId) {
        return gridApiRef.current?.getRowById(rowId)
      },
      getActiveCell() {
        return gridApiRef.current?.getActiveCell() ?? null
      },
      getSelection() {
        return gridApiRef.current?.getSelection() ?? createEmptySelection()
      },
      getColumnState() {
        return gridApiRef.current?.getColumnState() ?? []
      },
      setColumnState(state) {
        gridApiRef.current?.setColumnState(state)
      },
      setSort(sort) {
        gridApiRef.current?.setSort(sort)
      },
      setFilter(filter) {
        gridApiRef.current?.setFilter(filter)
      },
      expandAll() {
        gridApiRef.current?.expandAll()
      },
      collapseAll() {
        gridApiRef.current?.collapseAll()
      },
      refresh() {
        gridApiRef.current?.refresh()
      },
      refreshServerRows(opts) {
        if (mode === "paged") paged.refresh(opts)
        else if (mode === "infinite") infinite.refresh(opts)
        else gridApiRef.current?.refresh()
      },
      invalidateServerRows(invalidation) {
        if (mode === "paged") paged.invalidate(invalidation)
        else if (mode === "infinite") infinite.invalidate(invalidation)
      },
      retryServerBlock(blockKey) {
        if (mode === "paged") paged.retryBlock(blockKey)
        else if (mode === "infinite") infinite.retryBlock(blockKey)
      },
      getServerRowModelState() {
        if (mode === "paged") {
          const state = paged.getModelState()
          return {
            ...state,
            selection: toServerSelection(gridApiRef.current?.getSelection(), paged.view),
          }
        }
        if (mode === "infinite") {
          const state = infinite.getModelState()
          return {
            ...state,
            selection: toServerSelection(gridApiRef.current?.getSelection(), infinite.view),
          }
        }
        return createServerRowModelState({
          mode,
          rowCount: "unknown",
          selection: toServerSelection(gridApiRef.current?.getSelection(), paged.view),
          view: paged.view,
        })
      },
    }
  }, [gridApiRef, infinite, paged, props.rowModel])

  useEffect(() => assignRef(externalApiRef, serverApi), [externalApiRef, serverApi])

  const gridProps = props as unknown as BcGridProps<TRow>
  const loading =
    props.loading ??
    (props.rowModel === "paged"
      ? paged.loading
      : props.rowModel === "infinite"
        ? infinite.loading
        : true)
  const loadingOverlay =
    props.loadingOverlay ??
    (props.rowModel === "paged" && paged.error
      ? "Failed to load rows"
      : props.rowModel === "infinite" && infinite.error
        ? "Failed to load rows"
        : undefined)

  return (
    <BcGrid
      {...gridProps}
      data={
        props.rowModel === "paged" ? paged.rows : props.rowModel === "infinite" ? infinite.rows : []
      }
      apiRef={gridApiRef}
      loading={loading}
      loadingOverlay={loadingOverlay}
      onFilterChange={
        props.rowModel === "infinite" ? infinite.handleFilterChange : paged.handleFilterChange
      }
      onSortChange={
        props.rowModel === "infinite" ? infinite.handleSortChange : paged.handleSortChange
      }
      {...(props.rowModel === "infinite"
        ? { onVisibleRowRangeChange: infinite.handleVisibleRowRangeChange }
        : {})}
    />
  )
}

function usePagedServerState<TRow>(
  props: BcServerGridProps<TRow>,
  visibleColumns: readonly ColumnId[],
): PagedServerState<TRow> {
  const modelRef = useRef(createServerRowModel<TRow>())
  const latestBlockKeyRef = useRef<ServerBlockKey | null>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [result, setResult] = useState<ServerPagedResult<TRow> | undefined>(() =>
    props.rowModel === "paged" ? props.initialResult : undefined,
  )
  const [loading, setLoading] = useState(() => props.rowModel === "paged" && !props.initialResult)
  const [error, setError] = useState<unknown>(null)

  const pageControlled = hasProp(props, "page")
  const pageSizeControlled = hasProp(props, "pageSize")
  const [uncontrolledPage, setUncontrolledPage] = useState(() =>
    props.rowModel === "paged" ? (props.defaultPage ?? props.initialResult?.pageIndex ?? 0) : 0,
  )
  const [uncontrolledPageSize, setUncontrolledPageSize] = useState(() =>
    props.rowModel === "paged"
      ? (props.pageSize ??
        props.defaultPageSize ??
        props.initialResult?.pageSize ??
        DEFAULT_SERVER_PAGE_SIZE)
      : DEFAULT_SERVER_PAGE_SIZE,
  )
  const pageIndex = pageControlled ? (props.page ?? 0) : uncontrolledPage
  const pageSize = pageSizeControlled
    ? (props.pageSize ?? DEFAULT_SERVER_PAGE_SIZE)
    : uncontrolledPageSize

  const sortControlled = hasProp(props, "sort")
  const [uncontrolledSort, setUncontrolledSort] = useState<readonly BcGridSort[]>(
    () => props.defaultSort ?? [],
  )
  const sortState = sortControlled ? (props.sort ?? []) : uncontrolledSort

  const filterControlled = hasProp(props, "filter")
  const [uncontrolledFilter, setUncontrolledFilter] = useState<BcGridFilter | undefined>(
    () => props.defaultFilter,
  )
  const filterState = filterControlled ? props.filter : uncontrolledFilter

  const searchText = props.searchText ?? props.defaultSearchText
  const groupBy = props.groupBy ?? props.defaultGroupBy ?? []
  const loadPage = props.rowModel === "paged" ? props.loadPage : undefined
  const view = useMemo(
    () =>
      createServerViewState({
        filter: filterState,
        groupBy,
        locale: props.locale,
        searchText,
        sort: sortState,
        visibleColumns,
      }),
    [filterState, groupBy, props.locale, searchText, sortState, visibleColumns],
  )
  const viewKey = useMemo(() => modelRef.current.createViewKey(view), [view])

  const updatePagination = useCallback(
    (next: BcPaginationState) => {
      const prev = { page: pageIndex, pageSize }
      if (prev.page === next.page && prev.pageSize === next.pageSize) return
      if (!pageControlled) setUncontrolledPage(next.page)
      if (!pageSizeControlled) setUncontrolledPageSize(next.pageSize)
      props.onPaginationChange?.(next, prev)
    },
    [pageControlled, pageIndex, pageSize, pageSizeControlled, props.onPaginationChange],
  )

  const resetUncontrolledPage = useCallback(() => {
    if (pageIndex === 0) return
    updatePagination({ page: 0, pageSize })
  }, [pageIndex, pageSize, updatePagination])

  const handleSortChange = useCallback(
    (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => {
      if (!sortControlled) setUncontrolledSort(next)
      resetUncontrolledPage()
      props.onSortChange?.(next, prev)
    },
    [props.onSortChange, resetUncontrolledPage, sortControlled],
  )

  const handleFilterChange = useCallback(
    (next: BcGridFilter, prev: BcGridFilter) => {
      if (!filterControlled) setUncontrolledFilter(next)
      resetUncontrolledPage()
      props.onFilterChange?.(next, prev)
    },
    [filterControlled, props.onFilterChange, resetUncontrolledPage],
  )

  const refresh = useCallback((opts?: { purge?: boolean }) => {
    if (opts?.purge) modelRef.current.cache.clear()
    setRefreshVersion((version) => version + 1)
  }, [])

  const invalidate = useCallback((invalidation: ServerInvalidation) => {
    modelRef.current.invalidate(invalidation)
    setRefreshVersion((version) => version + 1)
  }, [])

  const retryBlock = useCallback((blockKey: ServerBlockKey) => {
    modelRef.current.cache.delete(blockKey)
    setRefreshVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (!loadPage) return
    void refreshVersion

    const request = modelRef.current.loadPagedPage({
      loadPage,
      pageIndex,
      pageSize,
      view,
      viewKey,
    })
    latestBlockKeyRef.current = request.blockKey
    modelRef.current.abortExcept(request.blockKey)
    setLoading(true)
    setError(null)

    request.promise
      .then((nextResult) => {
        if (latestBlockKeyRef.current !== request.blockKey) return
        setResult(nextResult)
        setLoading(false)
      })
      .catch((nextError: unknown) => {
        if (latestBlockKeyRef.current !== request.blockKey || isAbortError(nextError)) return
        setError(nextError)
        setLoading(false)
      })
  }, [loadPage, pageIndex, pageSize, refreshVersion, view, viewKey])

  useEffect(() => () => modelRef.current.abortAll(), [])

  const rows = props.rowModel === "paged" ? (result?.rows ?? []) : []
  const rowCount = props.rowModel === "paged" ? (result?.totalRows ?? 0) : "unknown"
  const getModelState = useCallback(
    () =>
      modelRef.current.getState({
        mode: props.rowModel,
        rowCount,
        selection: toServerSelection(undefined, view),
        view,
        viewKey: result?.viewKey ?? viewKey,
      }),
    [props.rowModel, result?.viewKey, rowCount, view, viewKey],
  )

  return {
    error,
    getModelState,
    handleFilterChange,
    handleSortChange,
    invalidate,
    loading,
    refresh,
    retryBlock,
    rowCount,
    rows,
    view,
  }
}

function useInfiniteServerState<TRow>(
  props: BcServerGridProps<TRow>,
  visibleColumns: readonly ColumnId[],
): InfiniteServerState<TRow> {
  const modelRef = useRef(createServerRowModel<TRow>())
  const inFlightCountRef = useRef(0)
  const loadedRowsRef = useRef<TRow[]>([])
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [rows, setRows] = useState<readonly TRow[]>([])
  const [rowCount, setRowCount] = useState<number | "unknown">("unknown")
  const [loading, setLoading] = useState(() => props.rowModel === "infinite")
  const [error, setError] = useState<unknown>(null)

  const sortControlled = hasProp(props, "sort")
  const [uncontrolledSort, setUncontrolledSort] = useState<readonly BcGridSort[]>(
    () => props.defaultSort ?? [],
  )
  const sortState = sortControlled ? (props.sort ?? []) : uncontrolledSort

  const filterControlled = hasProp(props, "filter")
  const [uncontrolledFilter, setUncontrolledFilter] = useState<BcGridFilter | undefined>(
    () => props.defaultFilter,
  )
  const filterState = filterControlled ? props.filter : uncontrolledFilter

  const blockSize =
    props.rowModel === "infinite"
      ? (props.blockSize ?? DEFAULT_SERVER_BLOCK_SIZE)
      : DEFAULT_SERVER_BLOCK_SIZE
  const maxCachedBlocks = props.rowModel === "infinite" ? props.maxCachedBlocks : undefined
  const blockLoadDebounceMs = props.rowModel === "infinite" ? props.blockLoadDebounceMs : undefined
  const maxConcurrentRequests =
    props.rowModel === "infinite" ? props.maxConcurrentRequests : undefined
  const loadBlock = props.rowModel === "infinite" ? props.loadBlock : undefined
  const searchText = props.searchText ?? props.defaultSearchText
  const groupBy = props.groupBy ?? props.defaultGroupBy ?? []
  const view = useMemo(
    () =>
      createServerViewState({
        filter: filterState,
        groupBy,
        locale: props.locale,
        searchText,
        sort: sortState,
        visibleColumns,
      }),
    [filterState, groupBy, props.locale, searchText, sortState, visibleColumns],
  )
  const viewKey = useMemo(() => modelRef.current.createViewKey(view), [view])

  const syncRowsFromCache = useCallback(() => {
    const nextRows = collectContiguousInfiniteRows(modelRef.current.cache.toMap(), viewKey)
    loadedRowsRef.current = nextRows
    setRows(nextRows)
  }, [viewKey])

  const resetInfiniteRows = useCallback(() => {
    modelRef.current.abortAll()
    modelRef.current.cache.clear()
    inFlightCountRef.current = 0
    loadedRowsRef.current = []
    setRows([])
    setRowCount("unknown")
    setError(null)
    setRefreshVersion((version) => version + 1)
  }, [])

  const trackPromise = useCallback((promise: Promise<ServerBlockResult<TRow>>) => {
    inFlightCountRef.current += 1
    setLoading(true)
    promise
      .finally(() => {
        inFlightCountRef.current -= 1
        if (inFlightCountRef.current <= 0) setLoading(false)
      })
      .catch(() => {})
  }, [])

  const ensureBlock = useCallback(
    (rowIndex: number) => {
      if (!loadBlock) return
      const blockStart = Math.max(0, Math.floor(rowIndex / blockSize) * blockSize)
      const request = modelRef.current.loadInfiniteBlock({
        blockSize,
        blockStart,
        cacheOptions: {
          ...(maxCachedBlocks ? { maxBlocks: maxCachedBlocks } : {}),
          ...(blockLoadDebounceMs ? { blockLoadDebounceMs } : {}),
          ...(maxConcurrentRequests ? { maxConcurrentRequests } : {}),
        },
        loadBlock,
        view,
        viewKey,
      })

      if (request.cached) return
      if (request.deduped) return

      trackPromise(request.promise)
      request.promise
        .then((result) => {
          setError(null)
          const nextRows = mergeInfiniteRows(loadedRowsRef.current, result)
          if (nextRows) {
            loadedRowsRef.current = nextRows
            setRows(nextRows)
          } else {
            syncRowsFromCache()
          }
          if (result.totalRows != null) setRowCount(result.totalRows)
          else if (result.hasMore === false) setRowCount(result.blockStart + result.rows.length)
          else setRowCount("unknown")
        })
        .catch((nextError: unknown) => {
          if (isAbortError(nextError)) return
          setError(nextError)
        })
    },
    [
      blockLoadDebounceMs,
      blockSize,
      loadBlock,
      maxCachedBlocks,
      maxConcurrentRequests,
      syncRowsFromCache,
      trackPromise,
      view,
      viewKey,
    ],
  )

  useEffect(() => {
    if (!loadBlock) return
    void refreshVersion
    ensureBlock(0)
  }, [ensureBlock, loadBlock, refreshVersion])

  useEffect(() => () => modelRef.current.abortAll(), [])

  const handleVisibleRowRangeChange = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      if (!loadBlock) return
      ensureBlock(range.startIndex)
      ensureBlock(range.endIndex)
      if (rowCount === "unknown" || rows.length < rowCount) {
        ensureBlock(range.endIndex + blockSize)
      }
    },
    [blockSize, ensureBlock, loadBlock, rowCount, rows.length],
  )

  const handleSortChange = useCallback(
    (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => {
      if (!sortControlled) setUncontrolledSort(next)
      resetInfiniteRows()
      props.onSortChange?.(next, prev)
    },
    [props.onSortChange, resetInfiniteRows, sortControlled],
  )

  const handleFilterChange = useCallback(
    (next: BcGridFilter, prev: BcGridFilter) => {
      if (!filterControlled) setUncontrolledFilter(next)
      resetInfiniteRows()
      props.onFilterChange?.(next, prev)
    },
    [filterControlled, props.onFilterChange, resetInfiniteRows],
  )

  const refresh = useCallback((opts?: { purge?: boolean }) => {
    if (opts?.purge) {
      modelRef.current.cache.clear()
      loadedRowsRef.current = []
      setRows([])
      setRowCount("unknown")
      setError(null)
    }
    setRefreshVersion((version) => version + 1)
  }, [])

  const invalidate = useCallback(
    (invalidation: ServerInvalidation) => {
      modelRef.current.invalidate(invalidation)
      syncRowsFromCache()
      setRefreshVersion((version) => version + 1)
    },
    [syncRowsFromCache],
  )

  const retryBlock = useCallback((blockKey: ServerBlockKey) => {
    modelRef.current.cache.delete(blockKey)
    setRefreshVersion((version) => version + 1)
  }, [])

  const getModelState = useCallback(
    () =>
      modelRef.current.getState({
        mode: props.rowModel,
        rowCount,
        selection: toServerSelection(undefined, view),
        view,
        viewKey,
      }),
    [props.rowModel, rowCount, view, viewKey],
  )

  return {
    error,
    getModelState,
    handleFilterChange,
    handleSortChange,
    handleVisibleRowRangeChange,
    invalidate,
    loading,
    refresh,
    retryBlock,
    rowCount,
    rows,
    view,
  }
}

function createServerViewState(input: {
  filter: BcGridFilter | undefined
  groupBy: readonly ColumnId[]
  locale: string | undefined
  searchText: string | undefined
  sort: readonly BcGridSort[]
  visibleColumns: readonly ColumnId[]
}): ServerViewState {
  return {
    groupBy: input.groupBy.map((columnId) => ({ columnId })),
    sort: input.sort.map((entry) => ({
      columnId: entry.columnId,
      direction: entry.direction,
    })),
    visibleColumns: [...input.visibleColumns],
    ...(input.filter ? { filter: input.filter } : {}),
    ...(input.searchText ? { search: input.searchText } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
  }
}

function collectContiguousInfiniteRows<TRow>(
  blocks: Map<ServerBlockKey, ServerCacheBlock<TRow>>,
  viewKey: string,
): TRow[] {
  const loadedBlocks = [...blocks.values()]
    .filter((block) => block.viewKey === viewKey && block.state === "loaded")
    .sort((a, b) => a.start - b.start)
  const rows: TRow[] = []
  let expectedStart = 0

  for (const block of loadedBlocks) {
    if (block.start !== expectedStart) break
    rows.push(...block.rows)
    expectedStart = block.start + block.size
  }

  return rows
}

function mergeInfiniteRows<TRow>(
  currentRows: readonly TRow[],
  result: ServerBlockResult<TRow>,
): TRow[] | null {
  if (result.blockStart > currentRows.length) return null
  const nextRows = currentRows.slice()
  nextRows.splice(result.blockStart, result.blockSize, ...result.rows)
  return nextRows
}

function createServerRowModelState<TRow>(input: {
  mode: ServerRowModelMode
  rowCount: number | "unknown"
  selection: ServerSelection
  view: ServerViewState
}): ServerRowModelState<TRow> {
  return {
    blocks: new Map(),
    mode: input.mode,
    pendingMutations: new Map(),
    rowCount: input.rowCount,
    selection: input.selection,
    view: input.view,
    viewKey: "react-scaffold",
  }
}

function toServerSelection(
  selection: BcSelection | undefined,
  view: ServerViewState,
): ServerSelection {
  if (!selection) return { mode: "explicit", rowIds: new Set<RowId>() }
  if (selection.mode === "filtered") {
    return {
      mode: "filtered",
      except: selection.except,
      view,
      ...(selection.viewKey ? { viewKey: selection.viewKey } : {}),
    }
  }
  return selection
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
