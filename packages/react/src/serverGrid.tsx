import type {
  BcGridFilter,
  BcGridSort,
  BcPaginationState,
  BcSelection,
  BcServerGridApi,
  ColumnId,
  RowId,
  ServerBlockKey,
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
        else gridApiRef.current?.refresh()
      },
      invalidateServerRows(invalidation) {
        if (mode === "paged") paged.invalidate(invalidation)
      },
      retryServerBlock(blockKey) {
        if (mode === "paged") paged.retryBlock(blockKey)
      },
      getServerRowModelState() {
        if (mode === "paged") {
          const state = paged.getModelState()
          return {
            ...state,
            selection: toServerSelection(gridApiRef.current?.getSelection(), paged.view),
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
  }, [gridApiRef, paged, props.rowModel])

  useEffect(() => assignRef(externalApiRef, serverApi), [externalApiRef, serverApi])

  const gridProps = props as unknown as BcGridProps<TRow>
  const loading = props.loading ?? (props.rowModel === "paged" ? paged.loading : true)
  const loadingOverlay =
    props.loadingOverlay ??
    (props.rowModel === "paged" && paged.error ? "Failed to load rows" : undefined)

  return (
    <BcGrid
      {...gridProps}
      data={props.rowModel === "paged" ? paged.rows : []}
      apiRef={gridApiRef}
      loading={loading}
      loadingOverlay={loadingOverlay}
      onFilterChange={paged.handleFilterChange}
      onSortChange={paged.handleSortChange}
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
