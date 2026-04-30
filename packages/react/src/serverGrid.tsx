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
  ServerGroupKey,
  ServerInvalidation,
  ServerPagedResult,
  ServerRowModelMode,
  ServerRowModelState,
  ServerSelection,
  ServerViewState,
} from "@bc-grid/core"
import { emptyBcRangeSelection } from "@bc-grid/core"
import { createServerRowModel } from "@bc-grid/server-row-model"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BcGrid, useBcGridApi } from "./grid"
import { assignRef, createEmptySelection, hasProp } from "./gridInternals"
import type { BcGridProps, BcReactGridColumn, BcServerGridProps } from "./types"

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

interface ServerSortFilterState {
  filterState: BcGridFilter | undefined
  handleFilterChange: (next: BcGridFilter, prev: BcGridFilter) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  sortState: readonly BcGridSort[]
}

interface TreeServerState<TRow> {
  columns: readonly BcReactGridColumn<TRow>[]
  error: unknown
  getModelState: () => ServerRowModelState<TRow>
  handleFilterChange: (next: BcGridFilter, prev: BcGridFilter) => void
  handleSortChange: (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => void
  invalidate: (invalidation: ServerInvalidation) => void
  loading: boolean
  refresh: (opts?: { purge?: boolean }) => void
  retryBlock: (blockKey: ServerBlockKey) => void
  rowId: (row: TRow, index: number) => RowId
  rows: readonly TRow[]
  rowCount: number | "unknown"
  view: ServerViewState
}

interface TreeNode<TRow> {
  childIds: RowId[]
  childCount: number | "unknown"
  childrenLoaded: boolean
  error: unknown
  groupPath: ServerGroupKey[]
  hasChildren: boolean
  kind: "leaf" | "group"
  level: number
  loading: boolean
  parentRowId: RowId | null
  row: TRow
  rowId: RowId
}

interface TreeSnapshot<TRow> {
  nodes: Map<RowId, TreeNode<TRow>>
  rootIds: RowId[]
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
  const tree = useTreeServerState(props, visibleColumns)

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
      getRangeSelection() {
        return gridApiRef.current?.getRangeSelection() ?? emptyBcRangeSelection
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
      setRangeSelection(selection) {
        gridApiRef.current?.setRangeSelection(selection)
      },
      copyRange(range) {
        return gridApiRef.current?.copyRange(range) ?? Promise.resolve()
      },
      clearRangeSelection() {
        gridApiRef.current?.clearRangeSelection()
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
        else if (mode === "tree") tree.refresh(opts)
        else gridApiRef.current?.refresh()
      },
      invalidateServerRows(invalidation) {
        if (mode === "paged") paged.invalidate(invalidation)
        else if (mode === "infinite") infinite.invalidate(invalidation)
        else if (mode === "tree") tree.invalidate(invalidation)
      },
      retryServerBlock(blockKey) {
        if (mode === "paged") paged.retryBlock(blockKey)
        else if (mode === "infinite") infinite.retryBlock(blockKey)
        else if (mode === "tree") tree.retryBlock(blockKey)
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
        if (mode === "tree") {
          const state = tree.getModelState()
          return {
            ...state,
            selection: toServerSelection(gridApiRef.current?.getSelection(), tree.view),
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
  }, [gridApiRef, infinite, paged, props.rowModel, tree])

  useEffect(() => assignRef(externalApiRef, serverApi), [externalApiRef, serverApi])

  const gridProps = props as unknown as BcGridProps<TRow>
  const loading =
    props.loading ??
    (props.rowModel === "paged"
      ? paged.loading
      : props.rowModel === "infinite"
        ? infinite.loading
        : props.rowModel === "tree"
          ? tree.loading
          : true)
  const loadingOverlay =
    props.loadingOverlay ??
    (props.rowModel === "paged" && paged.error
      ? "Failed to load rows"
      : props.rowModel === "infinite" && infinite.error
        ? "Failed to load rows"
        : props.rowModel === "tree" && tree.error
          ? "Failed to load rows"
          : undefined)

  return (
    <BcGrid
      {...gridProps}
      columns={props.rowModel === "tree" ? tree.columns : gridProps.columns}
      data={
        props.rowModel === "paged"
          ? paged.rows
          : props.rowModel === "infinite"
            ? infinite.rows
            : props.rowModel === "tree"
              ? tree.rows
              : []
      }
      apiRef={gridApiRef}
      loading={loading}
      loadingOverlay={loadingOverlay}
      onFilterChange={
        props.rowModel === "tree"
          ? tree.handleFilterChange
          : props.rowModel === "infinite"
            ? infinite.handleFilterChange
            : paged.handleFilterChange
      }
      onSortChange={
        props.rowModel === "tree"
          ? tree.handleSortChange
          : props.rowModel === "infinite"
            ? infinite.handleSortChange
            : paged.handleSortChange
      }
      rowId={props.rowModel === "tree" ? tree.rowId : gridProps.rowId}
      {...(props.rowModel === "infinite"
        ? { onVisibleRowRangeChange: infinite.handleVisibleRowRangeChange }
        : {})}
    />
  )
}

function useServerSortFilterState<TRow>(
  props: BcServerGridProps<TRow>,
  resetRows: () => void,
): ServerSortFilterState {
  const sortControlled = hasProp(props, "sort")
  const [uncontrolledSort, setUncontrolledSort] = useState<readonly BcGridSort[]>(
    () => props.defaultSort ?? [],
  )
  const filterControlled = hasProp(props, "filter")
  const [uncontrolledFilter, setUncontrolledFilter] = useState<BcGridFilter | undefined>(
    () => props.defaultFilter,
  )

  const handleSortChange = useCallback(
    (next: readonly BcGridSort[], prev: readonly BcGridSort[]) => {
      if (!sortControlled) setUncontrolledSort(next)
      resetRows()
      props.onSortChange?.(next, prev)
    },
    [props.onSortChange, resetRows, sortControlled],
  )

  const handleFilterChange = useCallback(
    (next: BcGridFilter, prev: BcGridFilter) => {
      if (!filterControlled) setUncontrolledFilter(next)
      resetRows()
      props.onFilterChange?.(next, prev)
    },
    [filterControlled, props.onFilterChange, resetRows],
  )

  return {
    filterState: filterControlled ? props.filter : uncontrolledFilter,
    handleFilterChange,
    handleSortChange,
    sortState: sortControlled ? (props.sort ?? []) : uncontrolledSort,
  }
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

  const { filterState, handleFilterChange, handleSortChange, sortState } = useServerSortFilterState(
    props,
    resetUncontrolledPage,
  )
  const searchText = props.searchText ?? props.defaultSearchText
  const groupBy = props.groupBy ?? props.defaultGroupBy ?? []
  const loadPage = props.rowModel === "paged" ? props.loadPage : undefined
  const view = useMemo(
    () =>
      modelRef.current.createViewState({
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

  const refresh = useCallback((opts?: { purge?: boolean }) => {
    if (opts?.purge) modelRef.current.cache.clear()
    setRefreshVersion((version) => version + 1)
  }, [])

  const invalidate = useCallback(
    (invalidation: ServerInvalidation) => {
      modelRef.current.invalidate(invalidation, { rowId: props.rowId })
      setRefreshVersion((version) => version + 1)
    },
    [props.rowId],
  )

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
        if (
          latestBlockKeyRef.current !== request.blockKey ||
          modelRef.current.isAbortError(nextError)
        )
          return
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
  const visibleRangeRef = useRef({ endIndex: 0, startIndex: 0 })
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [rows, setRows] = useState<readonly TRow[]>([])
  const [rowCount, setRowCount] = useState<number | "unknown">("unknown")
  const [loading, setLoading] = useState(() => props.rowModel === "infinite")
  const [error, setError] = useState<unknown>(null)

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

  const { filterState, handleFilterChange, handleSortChange, sortState } = useServerSortFilterState(
    props,
    resetInfiniteRows,
  )

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
      modelRef.current.createViewState({
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
    const nextRows = modelRef.current.collectContiguousInfiniteRows(viewKey)
    loadedRowsRef.current = nextRows
    setRows(nextRows)
  }, [viewKey])

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
          const nextRows = modelRef.current.mergeInfiniteRows(loadedRowsRef.current, result)
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
          if (modelRef.current.isAbortError(nextError)) return
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
      visibleRangeRef.current = range
      if (!loadBlock) return
      ensureBlock(range.startIndex)
      ensureBlock(range.endIndex)
      if (rowCount === "unknown" || rows.length < rowCount) {
        ensureBlock(range.endIndex + blockSize)
      }
    },
    [blockSize, ensureBlock, loadBlock, rowCount, rows.length],
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
      modelRef.current.invalidate(invalidation, { rowId: props.rowId })
      syncRowsFromCache()
      const range = visibleRangeRef.current
      ensureBlock(range.startIndex)
      ensureBlock(range.endIndex)
      if (rowCount === "unknown" || rows.length < rowCount) {
        ensureBlock(range.endIndex + blockSize)
      }
      setRefreshVersion((version) => version + 1)
    },
    [blockSize, ensureBlock, props.rowId, rowCount, rows.length, syncRowsFromCache],
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

function useTreeServerState<TRow>(
  props: BcServerGridProps<TRow>,
  visibleColumns: readonly ColumnId[],
): TreeServerState<TRow> {
  const modelRef = useRef(createServerRowModel<TRow>())
  const rootLoadSequenceRef = useRef(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [tree, setTree] = useState<TreeSnapshot<TRow>>(() => modelRef.current.createTreeSnapshot())
  const [error, setError] = useState<unknown>(null)
  const [rootLoading, setRootLoading] = useState(() => props.rowModel === "tree")

  const resetTreeRows = useCallback(() => {
    modelRef.current.abortAll()
    modelRef.current.cache.clear()
    setTree(modelRef.current.createTreeSnapshot())
    setError(null)
    setRootLoading(props.rowModel === "tree")
    setRefreshVersion((version) => version + 1)
  }, [props.rowModel])

  const { filterState, handleFilterChange, handleSortChange, sortState } = useServerSortFilterState(
    props,
    resetTreeRows,
  )

  const expansionControlled = hasProp(props, "expansion")
  const [uncontrolledExpansion, setUncontrolledExpansion] = useState<ReadonlySet<RowId>>(
    () => props.defaultExpansion ?? new Set<RowId>(),
  )
  const expansionState = expansionControlled
    ? (props.expansion ?? new Set<RowId>())
    : uncontrolledExpansion

  const childCount = DEFAULT_SERVER_BLOCK_SIZE
  const loadChildRows = props.rowModel === "tree" ? props.loadChildren : undefined
  const loadRootRows = props.rowModel === "tree" ? props.loadRoots : undefined
  const searchText = props.searchText ?? props.defaultSearchText
  const groupBy = props.groupBy ?? props.defaultGroupBy ?? []
  const view = useMemo(
    () =>
      modelRef.current.createViewState({
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

  const flatNodes = useMemo(
    () => modelRef.current.flattenTreeSnapshot(tree, expansionState),
    [expansionState, tree],
  )
  const rows = flatNodes.map((node) => node.row)

  const setExpansion = useCallback(
    (next: ReadonlySet<RowId>) => {
      const prev = expansionState
      if (!expansionControlled) setUncontrolledExpansion(next)
      props.onExpansionChange?.(next, prev)
    },
    [expansionControlled, expansionState, props.onExpansionChange],
  )

  const loadTreeChildren = useCallback(
    (node: TreeNode<TRow> | null) => {
      if (!loadChildRows) return
      const rootLoadId = node ? null : ++rootLoadSequenceRef.current
      const loader = node ? loadChildRows : (loadRootRows ?? loadChildRows)
      const parentRowId = node?.rowId ?? null
      const groupPath = node?.groupPath ?? []
      const request = modelRef.current.loadTreeChildren({
        childCount,
        childStart: 0,
        groupPath,
        loadChildren: loader,
        parentRowId,
        rowId: props.rowId,
        view,
        viewKey,
      })

      setError(null)
      if (node) {
        setTree((prev) =>
          modelRef.current.updateTreeNode(prev, node.rowId, { loading: true, error: null }),
        )
      } else {
        setRootLoading(true)
      }

      request.promise
        .then((result) => {
          setTree((prev) =>
            modelRef.current.mergeTreeResult({
              getRowId: props.rowId,
              parentNode: node,
              result,
              snapshot: prev,
              viewKey: result.viewKey ?? viewKey,
            }),
          )
          setError(null)
        })
        .catch((nextError: unknown) => {
          if (modelRef.current.isAbortError(nextError)) return
          setError(nextError)
          if (node) {
            setTree((prev) =>
              modelRef.current.updateTreeNode(prev, node.rowId, {
                error: nextError,
                loading: false,
              }),
            )
          }
        })
        .finally(() => {
          if (rootLoadId != null && rootLoadSequenceRef.current === rootLoadId) {
            setRootLoading(false)
          }
        })
    },
    [childCount, loadChildRows, loadRootRows, props.rowId, view, viewKey],
  )

  useEffect(() => {
    if (!loadChildRows) return
    void refreshVersion
    loadTreeChildren(null)
  }, [loadChildRows, loadTreeChildren, refreshVersion])

  useEffect(() => () => modelRef.current.abortAll(), [])

  const toggleNode = useCallback(
    (rowId: RowId) => {
      const node = tree.nodes.get(rowId)
      if (!node || !node.hasChildren) return
      const nextExpansion = new Set(expansionState)
      if (nextExpansion.has(rowId)) {
        nextExpansion.delete(rowId)
        setExpansion(nextExpansion)
        return
      }
      nextExpansion.add(rowId)
      setExpansion(nextExpansion)
      if (!node.childrenLoaded && !node.loading) loadTreeChildren(node)
    },
    [expansionState, loadTreeChildren, setExpansion, tree.nodes],
  )

  const columns = useMemo(
    () =>
      props.rowModel === "tree"
        ? createTreeColumns({
            columns: props.columns,
            expandedRowIds: expansionState,
            nodeByRowId: tree.nodes,
            toggleNode,
          })
        : props.columns,
    [expansionState, props.columns, props.rowModel, toggleNode, tree.nodes],
  )

  const rowId = useCallback(
    (row: TRow, index: number) => flatNodes[index]?.rowId ?? props.rowId(row, index),
    [flatNodes, props.rowId],
  )

  const refresh = useCallback((opts?: { purge?: boolean }) => {
    if (opts?.purge) {
      modelRef.current.cache.clear()
      setTree(modelRef.current.createTreeSnapshot())
    }
    setRefreshVersion((version) => version + 1)
  }, [])

  const invalidate = useCallback(
    (invalidation: ServerInvalidation) => {
      modelRef.current.invalidate(invalidation, { rowId: props.rowId })
      setTree(modelRef.current.createTreeSnapshot())
      setRefreshVersion((version) => version + 1)
    },
    [props.rowId],
  )

  const retryBlock = useCallback((blockKey: ServerBlockKey) => {
    modelRef.current.cache.delete(blockKey)
    setRefreshVersion((version) => version + 1)
  }, [])

  const getModelState = useCallback(
    () =>
      modelRef.current.getState({
        mode: props.rowModel,
        rowCount: rows.length,
        selection: toServerSelection(undefined, view),
        view,
        viewKey,
      }),
    [props.rowModel, rows.length, view, viewKey],
  )

  return {
    columns,
    error,
    getModelState,
    handleFilterChange,
    handleSortChange,
    invalidate,
    loading: props.rowModel === "tree" && rootLoading && rows.length === 0 && !error,
    refresh,
    retryBlock,
    rowCount: props.rowModel === "tree" ? rows.length : "unknown",
    rowId,
    rows,
    view,
  }
}

function createTreeColumns<TRow>(input: {
  columns: readonly BcReactGridColumn<TRow>[]
  expandedRowIds: ReadonlySet<RowId>
  nodeByRowId: Map<RowId, TreeNode<TRow>>
  toggleNode: (rowId: RowId) => void
}): readonly BcReactGridColumn<TRow>[] {
  const treeColumnIndex = input.columns.findIndex((column) => !column.hidden)
  if (treeColumnIndex === -1) return input.columns

  return input.columns.map((column, index) => {
    if (index !== treeColumnIndex) return column
    return {
      ...column,
      cellRenderer(params) {
        const node = input.nodeByRowId.get(params.rowId)
        const content = column.cellRenderer ? column.cellRenderer(params) : params.formattedValue
        if (!node) return content
        const expanded = input.expandedRowIds.has(node.rowId)
        return (
          <span className="bc-grid-tree-cell">
            <span className="bc-grid-tree-indent" style={{ width: `${node.level * 1.25}rem` }} />
            {node.hasChildren ? (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? "Collapse row" : "Expand row"}
                className="bc-grid-tree-toggle"
                onClick={(event) => {
                  event.stopPropagation()
                  input.toggleNode(node.rowId)
                }}
              >
                {expanded ? "v" : ">"}
              </button>
            ) : (
              <span aria-hidden="true" className="bc-grid-tree-spacer" />
            )}
            <span>{content}</span>
          </span>
        )
      },
    } satisfies BcReactGridColumn<TRow>
  })
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
