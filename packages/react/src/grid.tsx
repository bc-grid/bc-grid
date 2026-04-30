import { flash } from "@bc-grid/animations"
import type {
  BcCellPosition,
  BcColumnFilter,
  BcColumnStateEntry,
  BcGridApi,
  BcGridFilter,
  BcGridSort,
  BcPaginationState,
  BcSelection,
  ColumnId,
  RowId,
} from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type UIEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { BcGridAggregationFooterRow, useAggregations } from "./aggregations"
import { renderBodyCell } from "./bodyCells"
import {
  type ColumnVisibilityItem,
  ColumnVisibilityMenu,
  type ColumnVisibilityMenuAnchor,
} from "./columnVisibility"
import { createDetailToggleColumn } from "./detailColumn"
import { EditorPortal, defaultTextEditor } from "./editorPortal"
import {
  type ColumnFilterText,
  type ColumnFilterTypeByColumnId,
  buildGridFilter,
  matchesGridFilter,
} from "./filter"
import {
  DEFAULT_BODY_HEIGHT,
  DEFAULT_COL_WIDTH,
  type RowEntry,
  applyScroll,
  assertNoMixedControlledProps,
  assignRef,
  canvasStyle,
  cellDomId,
  classNames,
  columnIdFor,
  createEmptySelection,
  defaultMessages,
  deriveColumnState,
  domToken,
  hasProp,
  headerRowStyle,
  headerViewportStyle,
  overlayStyle,
  pinnedEdgeFor,
  resolveColumns,
  resolveFallbackBodyHeight,
  resolveHeaderHeight,
  resolveRowHeight,
  rootStyle,
  rowStyle,
  scrollerStyle,
  useColumnReorder,
  useColumnResize,
  useControlledState,
  useFlipOnSort,
  useLiveRegionAnnouncements,
  useViewportSync,
  visuallyHiddenStyle,
} from "./gridInternals"
import {
  type ColumnMenuAnchor,
  type SortModifiers,
  renderFilterCell,
  renderHeaderCell,
} from "./headerCells"
import { nextKeyboardNav } from "./keyboard"
import {
  BcGridPagination,
  DEFAULT_CLIENT_PAGE_SIZE,
  getPaginationWindow,
  normalisePageSizeOptions,
} from "./pagination"
import {
  readPersistedGridState,
  readUrlPersistedGridState,
  usePersistedGridStateWriter,
  useUrlPersistedGridStateWriter,
} from "./persistence"
import { matchesSearchText } from "./search"
import { isRowSelected, selectOnly, selectRange, toggleRow } from "./selection"
import { createSelectionCheckboxColumn } from "./selectionColumn"
import { appendSortFor, defaultCompareValues, removeSortFor, toggleSortFor } from "./sort"
import { BcStatusBar } from "./statusBar"
import type { BcCellEditCommitEvent, BcGridProps, BcReactGridColumn } from "./types"
import { useEditingController } from "./useEditingController"
import { formatCellValue, getCellValue } from "./value"

export function useBcGridApi<TRow>(): RefObject<BcGridApi<TRow> | null> {
  return useRef<BcGridApi<TRow> | null>(null)
}

const DEFAULT_DETAIL_HEIGHT = 144

export function BcGrid<TRow>(props: BcGridProps<TRow>): ReactNode {
  assertNoMixedControlledProps(props)

  const {
    data,
    columns,
    rowId,
    apiRef,
    height,
    rowHeight,
    rowIsInactive,
    rowIsDisabled,
    locale,
    toolbar,
    footer,
    loading,
    loadingOverlay,
    renderDetailPanel,
    detailPanelHeight,
    ariaLabel,
    ariaLabelledBy,
    onRowClick,
    onRowDoubleClick,
    onCellFocus,
    onVisibleRowRangeChange,
  } = props

  // The spread preserves all defaultMessages required fields; cast back
  // to the full BcGridMessages shape since `Partial<>` overrides widen
  // each function to `string | undefined` in the inferred result.
  const messages = useMemo(
    () => ({ ...defaultMessages, ...props.messages }) as typeof defaultMessages,
    [props.messages],
  )
  const persistedGridState = useMemo(() => readPersistedGridState(props.gridId), [props.gridId])
  const urlPersistedGridState = useMemo(
    () => readUrlPersistedGridState(props.urlStatePersistence),
    [props.urlStatePersistence],
  )
  const density = props.density ?? persistedGridState.density ?? "normal"
  const instanceId = useId()
  const domBaseId = useMemo(
    () => `bc-grid-${domToken(props.gridId ?? instanceId)}`,
    [props.gridId, instanceId],
  )

  const defaultRowHeight = resolveRowHeight(density, rowHeight)
  const headerHeight = resolveHeaderHeight(density)
  const fallbackBodyHeight = resolveFallbackBodyHeight(height, defaultRowHeight, headerHeight)
  const pageSizeOptions = useMemo(
    () => normalisePageSizeOptions(props.pageSizeOptions),
    [props.pageSizeOptions],
  )

  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 })
  const scrollOffsetRef = useRef(scrollOffset)
  const [, setRenderVersion] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const requestRender = useCallback(() => {
    setRenderVersion((version) => (version + 1) % Number.MAX_SAFE_INTEGER)
  }, [])
  const updateScrollOffset = useCallback((next: { top: number; left: number }) => {
    scrollOffsetRef.current = next
    setScrollOffset(next)
  }, [])
  const isRowDisabled = useCallback((row: TRow) => rowIsDisabled?.(row) ?? false, [rowIsDisabled])

  const [sortState, setSortState] = useControlledState<readonly BcGridSort[]>(
    hasProp(props, "sort"),
    props.sort ?? [],
    props.defaultSort ?? urlPersistedGridState.sort ?? [],
    props.onSortChange,
  )
  const [, setFilterState] = useControlledState<BcGridFilter | null>(
    hasProp(props, "filter"),
    props.filter ?? null,
    props.defaultFilter ?? null,
    props.onFilterChange
      ? (next, prev) => {
          if (next) props.onFilterChange?.(next, prev ?? next)
        }
      : undefined,
  )

  // Per-column text-filter inputs. Internal state — projected into the
  // canonical `BcGridFilter` shape via `buildGridFilter` and surfaced
  // through `setFilterState` whenever it changes.
  const [columnFilterText, setColumnFilterText] = useState<ColumnFilterText>({})
  const [selectionState, setSelectionState] = useControlledState<BcSelection>(
    hasProp(props, "selection"),
    props.selection ?? createEmptySelection(),
    props.defaultSelection ?? createEmptySelection(),
    props.onSelectionChange,
  )
  const emptyExpansion = useMemo(() => new Set<RowId>(), [])
  const [expansionState, setExpansionState] = useControlledState<ReadonlySet<RowId>>(
    hasProp(props, "expansion"),
    props.expansion ?? emptyExpansion,
    props.defaultExpansion ?? emptyExpansion,
    props.onExpansionChange,
  )
  const hasDetail = renderDetailPanel != null

  // Anchor for shift-click range selection. Set on plain click + ctrl/cmd
  // click; consumed (and reset) by shift-click. Held in a ref so we don't
  // re-render the grid just to update the anchor.
  const selectionAnchorRef = useRef<RowId | null>(null)
  const [columnMenu, setColumnMenu] = useState<ColumnVisibilityMenuAnchor | null>(null)

  const [columnState, setColumnState] = useControlledState<readonly BcColumnStateEntry[]>(
    hasProp(props, "columnState"),
    props.columnState ?? [],
    props.defaultColumnState ??
      urlPersistedGridState.columnState ??
      persistedGridState.columnState ??
      [],
    props.onColumnStateChange,
  )
  const [groupByState] = useControlledState<readonly ColumnId[]>(
    hasProp(props, "groupBy"),
    props.groupBy ?? [],
    props.defaultGroupBy ?? persistedGridState.groupBy ?? [],
    props.onGroupByChange,
  )
  const [pageState, setPageState] = useControlledState<number>(
    hasProp(props, "page"),
    props.page ?? 0,
    props.defaultPage ?? 0,
    undefined,
  )
  const [pageSizeState, setPageSizeState] = useControlledState<number | undefined>(
    hasProp(props, "pageSize"),
    props.pageSize,
    props.defaultPageSize ?? persistedGridState.pageSize,
    undefined,
  )
  const [activeCell, setActiveCell] = useControlledState<BcCellPosition | null>(
    hasProp(props, "activeCell"),
    props.activeCell ?? null,
    props.defaultActiveCell ?? null,
    props.onActiveCellChange,
  )

  // Consumer columns resolved for filter / sort lookups. The synthetic
  // selection-checkbox column (when `checkboxSelection` is on) is added
  // below into `resolvedColumns` for layout + render; rowEntries doesn't
  // need to know about it (synthetic column is `sortable: false`,
  // `filter: false`).
  const consumerResolvedColumns = useMemo(
    () => resolveColumns(columns, columnState),
    [columns, columnState],
  )
  // Persist the consumer-supplied column state only — the synthetic
  // selection-checkbox column (added later when `checkboxSelection` is on)
  // is runtime-only and must not be written to localStorage.
  const persistedColumnState = useMemo(
    () => deriveColumnState(consumerResolvedColumns, columnState),
    [columnState, consumerResolvedColumns],
  )
  const columnVisibilityItems = useMemo(
    () => buildColumnVisibilityItems(columns, columnState),
    [columns, columnState],
  )
  const persistenceState = useMemo(
    () => ({
      columnState: persistedColumnState,
      density,
      groupBy: groupByState,
      pageSize: pageSizeState,
    }),
    [density, groupByState, pageSizeState, persistedColumnState],
  )
  usePersistedGridStateWriter(props.gridId, persistenceState)
  const urlPersistenceState = useMemo(
    () => ({
      columnState: persistedColumnState,
      sort: sortState,
    }),
    [persistedColumnState, sortState],
  )
  useUrlPersistedGridStateWriter(props.urlStatePersistence, urlPersistenceState)

  const columnFilterTypes = useMemo<ColumnFilterTypeByColumnId>(() => {
    const next: Record<ColumnId, BcColumnFilter["type"]> = {}
    for (const column of consumerResolvedColumns) {
      const filter = column.source.filter
      if (filter) next[column.columnId] = filter.type
    }
    return next
  }, [consumerResolvedColumns])

  const activeFilter = useMemo(
    () => buildGridFilter(columnFilterText, columnFilterTypes),
    [columnFilterText, columnFilterTypes],
  )
  const searchText = props.searchText ?? props.defaultSearchText ?? ""
  const aggregationScope = props.aggregationScope ?? "filtered"

  const allRowEntries = useMemo<readonly RowEntry<TRow>[]>(() => {
    let visibleRows: TRow[] =
      props.showInactive === false && rowIsInactive
        ? data.filter((row) => !rowIsInactive(row))
        : [...data]

    // Filter step: pass the row's per-column formatted values to the
    // matcher. We use formatted values (not raw) so the result matches
    // what the user sees in the cell.
    if (activeFilter) {
      const columnsById = new Map(consumerResolvedColumns.map((c) => [c.columnId, c]))
      visibleRows = visibleRows.filter((row) =>
        matchesGridFilter(activeFilter, (columnId) => {
          const column = columnsById.get(columnId)
          if (!column) return ""
          const value = getCellValue(row, column.source)
          return {
            formattedValue: formatCellValue(value, row, column.source, locale),
            rawValue: value,
          }
        }),
      )
    }

    if (searchText.trim()) {
      const searchableColumns = consumerResolvedColumns.filter(
        (column) => column.source.filter !== false,
      )
      visibleRows = visibleRows.filter((row) =>
        matchesSearchText(
          searchText,
          searchableColumns.map((column) => {
            const value = getCellValue(row, column.source)
            return formatCellValue(value, row, column.source, locale)
          }),
        ),
      )
    }

    const built = visibleRows.map((row, index) => ({
      row,
      index,
      rowId: rowId(row, index),
    }))

    if (sortState.length === 0) return built

    // Sort using each column's comparator (or the default). Multi-column:
    // run keys in order, return the first non-zero comparison. After sort,
    // re-stamp `index` so DOM positioning + virtualizer state line up.
    const sorted = [...built].sort((a, b) => {
      for (const sort of sortState) {
        const column = consumerResolvedColumns.find((c) => c.columnId === sort.columnId)
        if (!column) continue
        const va = getCellValue(a.row, column.source)
        const vb = getCellValue(b.row, column.source)
        const cmp = column.source.comparator
          ? column.source.comparator(va, vb, a.row, b.row)
          : defaultCompareValues(va, vb)
        if (cmp !== 0) return sort.direction === "asc" ? cmp : -cmp
      }
      return 0
    })

    return sorted.map((entry, index) => ({ ...entry, index }))
  }, [
    activeFilter,
    data,
    locale,
    props.showInactive,
    consumerResolvedColumns,
    rowId,
    rowIsInactive,
    searchText,
    sortState,
  ])
  const paginationEnabled = props.pagination === true
  const effectivePageSize = pageSizeState ?? pageSizeOptions[0] ?? DEFAULT_CLIENT_PAGE_SIZE
  const paginationWindow = useMemo(
    () => getPaginationWindow(allRowEntries.length, pageState, effectivePageSize),
    [allRowEntries.length, effectivePageSize, pageState],
  )
  const paginationPageSizeOptions = useMemo(
    () =>
      pageSizeOptions.includes(effectivePageSize)
        ? pageSizeOptions
        : normalisePageSizeOptions([...pageSizeOptions, effectivePageSize]),
    [effectivePageSize, pageSizeOptions],
  )
  const rowEntries = useMemo<readonly RowEntry<TRow>[]>(() => {
    if (!paginationEnabled) return allRowEntries

    return allRowEntries
      .slice(paginationWindow.startIndex, paginationWindow.endIndex)
      .map((entry, index) => ({ ...entry, index }))
  }, [allRowEntries, paginationEnabled, paginationWindow.endIndex, paginationWindow.startIndex])
  const aggregationRows = useMemo(() => allRowEntries.map((entry) => entry.row), [allRowEntries])
  const getDetailHeight = useCallback(
    (entry: RowEntry<TRow>) => {
      if (!hasDetail) return 0
      const params = { row: entry.row, rowId: entry.rowId, rowIndex: entry.index }
      const height =
        typeof detailPanelHeight === "function"
          ? detailPanelHeight(params)
          : (detailPanelHeight ?? DEFAULT_DETAIL_HEIGHT)
      return Math.max(0, height)
    },
    [hasDetail, detailPanelHeight],
  )

  // Visible, selectable row IDs in display order (post-filter, post-sort).
  // Used by the synthetic selection-checkbox column's header to compute the
  // tri-state "all / some / none" master toggle while skipping disabled rows.
  const visibleSelectableRowIds = useMemo(
    () => rowEntries.filter((entry) => !isRowDisabled(entry.row)).map((entry) => entry.rowId),
    [isRowDisabled, rowEntries],
  )

  // Layout-resolved columns including the synthetic pinned-left checkbox
  // column when `checkboxSelection` is on. The synthetic column is rebuilt
  // on every render so its closure captures the live selectionState +
  // setter; resolveColumns is cheap so the cache miss here is acceptable.
  const resolvedColumns = useMemo(() => {
    if (!props.checkboxSelection && !hasDetail) return consumerResolvedColumns
    const syntheticColumns: BcReactGridColumn<TRow>[] = []
    if (hasDetail) {
      syntheticColumns.push(
        createDetailToggleColumn<TRow>({
          expansionState,
          setExpansionState,
        }),
      )
    }
    if (props.checkboxSelection) {
      syntheticColumns.push(
        createSelectionCheckboxColumn<TRow>({
          selectionState,
          setSelectionState,
          visibleRowIds: visibleSelectableRowIds,
        }),
      )
    }
    return resolveColumns([...syntheticColumns, ...columns], columnState)
  }, [
    columns,
    columnState,
    consumerResolvedColumns,
    hasDetail,
    expansionState,
    props.checkboxSelection,
    selectionState,
    setExpansionState,
    setSelectionState,
    visibleSelectableRowIds,
  ])
  const aggregationResults = useAggregations(aggregationRows, columns, {
    allRows: data,
    locale,
    rowId,
    scope: aggregationScope,
    selection: selectionState,
  })
  const hasAggregationFooter = aggregationResults.length > 0

  const columnIndexById = useMemo(() => {
    const map = new Map<(typeof resolvedColumns)[number]["columnId"], number>()
    resolvedColumns.forEach((column, index) => map.set(column.columnId, index))
    return map
  }, [resolvedColumns])

  // Surface activeFilter through the controlled setFilterState contract so
  // consumers using the `filter` prop see the canonical BcGridFilter shape
  // when the user types.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setFilterState identity isn't useful here
  useEffect(() => {
    if (activeFilter) setFilterState(activeFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter])

  const { politeMessage, assertiveMessage, announcePolite, announceAssertive } =
    useLiveRegionAnnouncements({
      sortState,
      resolvedColumns,
      activeFilter,
      rowEntries,
      data,
      selectionState,
      messages,
    })

  const rowsById = useMemo(() => {
    const map = new Map<RowId, RowEntry<TRow>>()
    for (const entry of rowEntries) map.set(entry.rowId, entry)
    return map
  }, [rowEntries])

  const rowIndexById = useMemo(() => {
    const map = new Map<RowId, number>()
    for (const entry of rowEntries) map.set(entry.rowId, entry.index)
    return map
  }, [rowEntries])

  const pinnedLeftCols = useMemo(
    () => resolvedColumns.filter((column) => column.pinned === "left").length,
    [resolvedColumns],
  )
  const pinnedRightCols = useMemo(
    () => resolvedColumns.filter((column) => column.pinned === "right").length,
    [resolvedColumns],
  )

  const virtualizer = useMemo(() => {
    const next = new Virtualizer({
      rowCount: rowEntries.length,
      colCount: resolvedColumns.length,
      defaultRowHeight,
      defaultColWidth: DEFAULT_COL_WIDTH,
      viewportHeight: fallbackBodyHeight,
      viewportWidth: 800,
      pinnedLeftCols,
      pinnedRightCols,
    })

    resolvedColumns.forEach((column, index) => next.setColWidth(index, column.width))
    if (hasDetail) {
      rowEntries.forEach((entry, index) => {
        if (!expansionState.has(entry.rowId)) return
        next.setRowHeight(index, defaultRowHeight + getDetailHeight(entry))
      })
    }
    next.setScrollTop(scrollOffsetRef.current.top)
    next.setScrollLeft(scrollOffsetRef.current.left)
    return next
  }, [
    defaultRowHeight,
    hasDetail,
    getDetailHeight,
    expansionState,
    fallbackBodyHeight,
    pinnedLeftCols,
    pinnedRightCols,
    resolvedColumns,
    rowEntries,
    rowEntries.length,
  ])

  const { viewport } = useViewportSync({
    scrollerRef,
    virtualizer,
    fallbackBodyHeight,
    requestRender,
  })

  const activeRowIndex = activeCell ? rowIndexById.get(activeCell.rowId) : undefined
  const activeColIndex = activeCell ? columnIndexById.get(activeCell.columnId) : undefined

  useEffect(() => {
    if (activeRowIndex != null) virtualizer.retainRow(activeRowIndex, true)
    if (activeColIndex != null) virtualizer.retainCol(activeColIndex, true)
    requestRender()

    return () => {
      if (activeRowIndex != null) virtualizer.retainRow(activeRowIndex, false)
      if (activeColIndex != null) virtualizer.retainCol(activeColIndex, false)
    }
  }, [activeColIndex, activeRowIndex, requestRender, virtualizer])

  const virtualWindow = virtualizer.computeWindow()
  const firstVirtualRow = virtualWindow.rows.reduce(
    (first, row) => Math.min(first, row.index),
    Number.POSITIVE_INFINITY,
  )
  const lastVirtualRow = virtualWindow.rows.reduce((last, row) => Math.max(last, row.index), -1)

  useEffect(() => {
    if (!onVisibleRowRangeChange || lastVirtualRow < 0) return
    onVisibleRowRangeChange({
      startIndex: firstVirtualRow === Number.POSITIVE_INFINITY ? 0 : firstVirtualRow,
      endIndex: lastVirtualRow,
    })
  }, [firstVirtualRow, lastVirtualRow, onVisibleRowRangeChange])

  // Editing controller. The framework owns the lifecycle / state machine /
  // overlay; consumers wire commit semantics via `onCellEditCommit` (read
  // off props since it's declared on `BcEditGridProps` and reaches us via
  // spread). Sync + async per-column `validate` runs through the
  // controller before the overlay updates.
  const onCellEditCommitProp = (
    props as {
      onCellEditCommit?: (event: BcCellEditCommitEvent<TRow>) => void | Promise<void>
    }
  ).onCellEditCommit
  const editController = useEditingController<TRow>({
    ...(onCellEditCommitProp ? { onCellEditCommit: onCellEditCommitProp } : {}),
    validate: (value, row, columnId) => {
      const column = consumerResolvedColumns.find((c) => c.columnId === columnId)
      if (!column?.source.validate) return { valid: true }
      return column.source.validate(value as never, row)
    },
    // Live-region announce per `editing-rfc §Live Regions`. The
    // controller fires committed / validationError / serverError; the
    // grid renders polite for committed and assertive for the two
    // error variants so AT interrupts speech on rejection.
    announce: (event) => {
      const columnLabel =
        typeof event.column.header === "string"
          ? event.column.header
          : (event.column.columnId ?? "this cell")
      if (event.kind === "committed") {
        const formattedValue = formatCellValue(event.nextValue, event.row, event.column, locale)
        const rowLabel = String(event.rowId)
        announcePolite(messages.editCommittedAnnounce({ columnLabel, rowLabel, formattedValue }))
        return
      }
      if (event.kind === "validationError") {
        announceAssertive(messages.editValidationErrorAnnounce({ columnLabel, error: event.error }))
        return
      }
      announceAssertive(messages.editServerErrorAnnounce({ columnLabel, error: event.error }))
    },
  })

  // Apply the moveOnSettle directive after the editor unmounts. The state
  // machine reaches Unmounting once the editor's useLayoutEffect cleanup
  // dispatches; we read `next.move`, advance the active cell, and dispatch
  // the final `unmounted` to land back in Navigation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dispatchUnmounted is stable; columnIndex/rowIndex are read at fire time
  useEffect(() => {
    if (editController.editState.mode !== "unmounting") return
    const next = editController.editState.next
    const cell = editController.editState.cell
    const rowIndex = rowIndexById.get(cell.rowId)
    const colIndex = columnIndexById.get(cell.columnId)
    if (rowIndex == null || colIndex == null) {
      editController.dispatchUnmounted()
      return
    }
    // Cell-flash on commit per `editing-rfc §Edit-cell paint perf`.
    // Off by default; opt-in via `BcGridProps.flashOnEdit`. Skipped when
    // the user prefers reduced motion (the `flash` primitive already
    // bails on the prefers-reduced-motion media query, so opting in
    // here is safe regardless). Only fires on a successful commit —
    // cancel paths have `next.committedValue === undefined`.
    if (props.flashOnEdit && next.committedValue !== undefined) {
      const cellEl = document.getElementById(cellDomId(domBaseId, cell.rowId, cell.columnId))
      if (cellEl) flash(cellEl)
    }
    let nextRow = rowIndex
    let nextCol = colIndex
    const lastRow = rowEntries.length - 1
    const lastCol = resolvedColumns.length - 1
    if (next.move === "down" && rowIndex < lastRow) nextRow = rowIndex + 1
    else if (next.move === "up" && rowIndex > 0) nextRow = rowIndex - 1
    else if (next.move === "right" && colIndex < lastCol) nextCol = colIndex + 1
    else if (next.move === "left" && colIndex > 0) nextCol = colIndex - 1
    const targetRow = rowEntries[nextRow]
    const targetCol = resolvedColumns[nextCol]
    if (targetRow && targetCol) {
      setActiveCell({ rowId: targetRow.rowId, columnId: targetCol.columnId })
    }
    rootRef.current?.focus({ preventScroll: true })
    editController.dispatchUnmounted()
  }, [
    editController.editState,
    rowEntries,
    resolvedColumns,
    rowIndexById,
    columnIndexById,
    props.flashOnEdit,
    domBaseId,
  ])

  // Pixel rect of the cell currently being edited — passed to the editor
  // portal for absolute positioning. Computed from the virtualizer so we
  // get the right offsets even when the row/col is in a pinned region.
  const editorCellRect = useMemo(() => {
    if (editController.editState.mode === "navigation") return null
    if (editController.editState.mode === "unmounting") return null
    const cell = editController.editState.cell
    const rowIndex = rowIndexById.get(cell.rowId)
    const colIndex = columnIndexById.get(cell.columnId)
    if (rowIndex == null || colIndex == null) return null
    const rowOffset = virtualizer.scrollOffsetForRow(rowIndex, "nearest")
    const colOffset = virtualizer.scrollOffsetForCol(colIndex, "nearest")
    const rowHeightAtIndex = defaultRowHeight
    const column = resolvedColumns[colIndex]
    return {
      top: rowOffset - scrollOffset.top,
      left: colOffset - scrollOffset.left,
      width: column?.width ?? 120,
      height: rowHeightAtIndex,
    }
  }, [
    editController.editState,
    rowIndexById,
    columnIndexById,
    virtualizer,
    defaultRowHeight,
    resolvedColumns,
    scrollOffset,
  ])

  const scrollToRow = useCallback(
    (targetRowId: RowId, align: "start" | "center" | "end" | "nearest" = "nearest") => {
      const rowIndex = rowIndexById.get(targetRowId)
      if (rowIndex == null) return
      const top = virtualizer.scrollOffsetForRow(rowIndex, align)
      applyScroll(scrollerRef.current, virtualizer, top, undefined, updateScrollOffset)
    },
    [rowIndexById, updateScrollOffset, virtualizer],
  )

  const scrollToCell = useCallback(
    (position: BcCellPosition, align: "start" | "center" | "end" | "nearest" = "nearest") => {
      const rowIndex = rowIndexById.get(position.rowId)
      const colIndex = columnIndexById.get(position.columnId)
      if (rowIndex == null || colIndex == null) return
      const top = virtualizer.scrollOffsetForRow(rowIndex, align)
      const left = virtualizer.scrollOffsetForCol(colIndex, align)
      applyScroll(scrollerRef.current, virtualizer, top, left, updateScrollOffset)
    },
    [columnIndexById, rowIndexById, updateScrollOffset, virtualizer],
  )

  const focusCell = useCallback(
    (position: BcCellPosition) => {
      setActiveCell(position)
      onCellFocus?.(position)
      scrollToCell(position)
      rootRef.current?.focus({ preventScroll: true })
    },
    [onCellFocus, scrollToCell, setActiveCell],
  )

  const api = useMemo<BcGridApi<TRow>>(
    () => ({
      scrollToRow(targetRowId, opts) {
        scrollToRow(targetRowId, opts?.align)
      },
      scrollToCell(position, opts) {
        scrollToCell(position, opts?.align)
      },
      focusCell,
      isCellVisible(position) {
        const rowIndex = rowIndexById.get(position.rowId)
        const colIndex = columnIndexById.get(position.columnId)
        if (rowIndex == null || colIndex == null) return false
        return virtualizer.isCellVisible(rowIndex, colIndex)
      },
      getRowById(targetRowId) {
        return rowsById.get(targetRowId)?.row
      },
      getActiveCell() {
        return activeCell
      },
      getSelection() {
        return selectionState
      },
      getColumnState() {
        return deriveColumnState(resolvedColumns, columnState)
      },
      setColumnState(next) {
        setColumnState(next)
      },
      setSort(next) {
        setSortState(next)
      },
      setFilter(next) {
        setFilterState(next)
      },
      expandAll() {
        if (!hasDetail) return
        setExpansionState(new Set(rowEntries.map((entry) => entry.rowId)))
      },
      collapseAll() {
        if (!hasDetail) return
        setExpansionState(new Set<RowId>())
      },
      refresh() {
        requestRender()
      },
    }),
    [
      activeCell,
      columnIndexById,
      columnState,
      hasDetail,
      focusCell,
      requestRender,
      resolvedColumns,
      rowIndexById,
      rowEntries,
      rowsById,
      scrollToCell,
      scrollToRow,
      selectionState,
      setColumnState,
      setExpansionState,
      setFilterState,
      setSortState,
      virtualizer,
    ],
  )

  useEffect(() => assignRef(apiRef, api), [apiRef, api])

  // Status-bar render context per `chrome-rfc §Status bar`. The
  // `aggregations` segment consumes the same `useAggregations` output
  // already feeding the in-grid aggregation footer row, so the segment
  // and the row stay in sync at zero extra cost.
  const statusBarContext = useMemo(
    () => ({
      api,
      totalRowCount: data.length,
      filteredRowCount: allRowEntries.length,
      selectedRowCount: computeSelectedRowCount(selectionState, data.length, allRowEntries.length),
      aggregations: aggregationResults,
    }),
    [api, aggregationResults, allRowEntries.length, data.length, selectionState],
  )

  const handlePaginationChange = useCallback(
    (next: BcPaginationState) => {
      const normalized = getPaginationWindow(allRowEntries.length, next.page, next.pageSize)
      const nextState = {
        page: normalized.page,
        pageSize: normalized.pageSize,
      }
      const prevState = {
        page: paginationWindow.page,
        pageSize: effectivePageSize,
      }
      if (nextState.page === prevState.page && nextState.pageSize === prevState.pageSize) return

      applyScroll(scrollerRef.current, virtualizer, 0, undefined, updateScrollOffset)
      setPageState(nextState.page)
      setPageSizeState(nextState.pageSize)
      props.onPaginationChange?.(nextState, prevState)
    },
    [
      allRowEntries.length,
      effectivePageSize,
      paginationWindow.page,
      props.onPaginationChange,
      setPageSizeState,
      setPageState,
      updateScrollOffset,
      virtualizer,
    ],
  )

  const renderedFooter =
    footer ??
    (paginationEnabled ? (
      <BcGridPagination
        page={paginationWindow.page}
        pageCount={paginationWindow.pageCount}
        pageSize={effectivePageSize}
        pageSizeOptions={paginationPageSizeOptions}
        totalRows={paginationWindow.totalRows}
        onChange={handlePaginationChange}
      />
    ) : null)

  const activeCellId = activeCell
    ? cellDomId(domBaseId, activeCell.rowId, activeCell.columnId)
    : undefined

  const rootHeight = typeof height === "number" ? height : undefined
  const bodyHeight =
    height === "auto" ? Math.min(virtualWindow.totalHeight, DEFAULT_BODY_HEIGHT) : undefined

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget
      virtualizer.setScrollTop(target.scrollTop)
      virtualizer.setScrollLeft(target.scrollLeft)
      updateScrollOffset({ top: target.scrollTop, left: target.scrollLeft })
    },
    [updateScrollOffset, virtualizer],
  )

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return
      if (activeCell || rowEntries.length === 0 || resolvedColumns.length === 0) return
      const firstRow = rowEntries[0]
      const firstColumn = resolvedColumns[0]
      if (!firstRow || !firstColumn) return
      setActiveCell({ rowId: firstRow.rowId, columnId: firstColumn.columnId })
    },
    [activeCell, resolvedColumns, rowEntries, setActiveCell],
  )

  // Approximate "page size" for PageUp/PageDown: full viewport rows minus
  // one for context overlap. Variable heights are handled approximately —
  // viewport / default-row gives close-enough behaviour for v0.1.
  const pageRowCount = Math.max(1, Math.floor(viewport.height / defaultRowHeight) - 1)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const lastRow = rowEntries.length - 1
      const lastCol = resolvedColumns.length - 1
      if (lastRow < 0 || lastCol < 0) return

      // Edit mode: the editor's own onKeyDown owns Tab / Enter / Esc /
      // Shift+Enter / Shift+Tab. The grid stays out of the way.
      if (editController.editState.mode !== "navigation") return

      const currentRow = activeCell ? (rowIndexById.get(activeCell.rowId) ?? 0) : 0
      const currentCol = activeCell ? (columnIndexById.get(activeCell.columnId) ?? 0) : 0

      // Activation paths per `editing-rfc §Activation`:
      //   - F2 / Enter: toggle edit mode on the active cell
      //   - Printable single character (no Ctrl/Meta): seed the editor
      //   - Double-click is handled separately on the cell (onDoubleClick)
      const isPrintable =
        event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
      const cellTarget = activeCell ?? null
      const cellRow = cellTarget ? rowEntries[currentRow] : null
      const cellColumn = cellTarget ? resolvedColumns[currentCol] : null
      if (
        cellTarget &&
        cellRow &&
        cellColumn &&
        !isRowDisabled(cellRow.row) &&
        isCellEditable(cellColumn, cellRow.row)
      ) {
        if (event.key === "F2" || event.key === "Enter") {
          event.preventDefault()
          editController.start(cellTarget, event.key === "F2" ? "f2" : "enter")
          return
        }
        if (isPrintable) {
          event.preventDefault()
          editController.start(cellTarget, "printable", { seedKey: event.key })
          return
        }
      }

      const outcome = nextKeyboardNav({
        key: event.key,
        ctrlOrMeta: event.ctrlKey || event.metaKey,
        shiftKey: event.shiftKey,
        currentRow,
        currentCol,
        lastRow,
        lastCol,
        pageRowCount,
      })

      if (outcome.type === "noop") return
      event.preventDefault()
      if (outcome.type === "preventDefault") return
      if (outcome.type === "toggleSelection") {
        const targetRow = rowEntries[currentRow]
        if (!targetRow) return
        if (isRowDisabled(targetRow.row)) return
        setSelectionState(toggleRow(selectionState, targetRow.rowId))
        selectionAnchorRef.current = targetRow.rowId
        return
      }

      const nextRow = rowEntries[outcome.row]
      const nextColumn = resolvedColumns[outcome.col]
      if (!nextRow || !nextColumn) return
      focusCell({ rowId: nextRow.rowId, columnId: nextColumn.columnId })
    },
    [
      activeCell,
      columnIndexById,
      editController,
      focusCell,
      isRowDisabled,
      pageRowCount,
      resolvedColumns,
      rowEntries,
      rowIndexById,
      selectionState,
      setSelectionState,
    ],
  )

  const { prepareSortAnimation } = useFlipOnSort({ sortState, scrollerRef, virtualizer })

  const handleHeaderSort = useCallback(
    (
      column: {
        columnId: (typeof resolvedColumns)[number]["columnId"]
        source: (typeof resolvedColumns)[number]["source"]
      },
      modifiers: SortModifiers,
    ) => {
      if (column.source.sortable === false) return
      prepareSortAnimation()
      // Ctrl/Cmd-click drops the column from the sort. Shift-click composes
      // a multi-column sort (append/cycle within). Plain click cycles a
      // single primary sort, replacing any multi-column composition.
      if (modifiers.ctrlOrMeta) {
        setSortState(removeSortFor(sortState, column.columnId))
        return
      }
      if (modifiers.shiftKey) {
        setSortState(appendSortFor(sortState, column.columnId))
        return
      }
      setSortState(toggleSortFor(sortState, column.columnId))
    },
    [prepareSortAnimation, setSortState, sortState],
  )

  const { handleResizePointerDown, handleResizePointerMove, endResize } = useColumnResize<TRow>({
    columnState,
    setColumnState,
  })
  const {
    columnReorderPreview,
    consumeColumnReorderClickSuppression,
    handleReorderPointerDown,
    handleReorderPointerMove,
    endReorder,
  } = useColumnReorder<TRow>({
    rootRef,
    columns: consumerResolvedColumns,
    layoutColumns: resolvedColumns,
    columnState,
    scrollLeft: scrollOffset.left,
    totalWidth: virtualWindow.totalWidth,
    viewportWidth: viewport.width,
    setColumnState,
  })
  const openColumnMenu = useCallback(
    (_column: (typeof resolvedColumns)[number], anchor: ColumnMenuAnchor) => {
      const margin = 8
      const menuWidth = 260
      const menuHeight = 360
      const viewportWidth = typeof window === "undefined" ? menuWidth : window.innerWidth
      const viewportHeight = typeof window === "undefined" ? menuHeight : window.innerHeight
      setColumnMenu({
        x: Math.min(
          Math.max(margin, anchor.x),
          Math.max(margin, viewportWidth - menuWidth - margin),
        ),
        y: Math.min(
          Math.max(margin, anchor.y),
          Math.max(margin, viewportHeight - menuHeight - margin),
        ),
      })
    },
    [],
  )
  const closeColumnMenu = useCallback(() => setColumnMenu(null), [])
  const toggleColumnHidden = useCallback(
    (columnId: ColumnId, hidden: boolean) => {
      if (hidden) {
        const item = columnVisibilityItems.find((entry) => entry.columnId === columnId)
        if (item?.hideDisabled) return
      }
      const next = columnState.some((entry) => entry.columnId === columnId)
        ? columnState.map((entry) => (entry.columnId === columnId ? { ...entry, hidden } : entry))
        : [...columnState, { columnId, hidden }]
      setColumnState(next)
    },
    [columnState, columnVisibilityItems, setColumnState],
  )

  useEffect(() => {
    if (!columnMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (
        target.closest(".bc-grid-column-menu") ||
        target.closest('[data-bc-grid-column-menu-button="true"]')
      ) {
        return
      }
      setColumnMenu(null)
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setColumnMenu(null)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [columnMenu])

  // Pinned-edge scroll-shadow indicators. Surfaces as data attrs on the
  // grid root so theming can render shadows when content has scrolled
  // under a pinned region.
  const maxScrollLeft = Math.max(0, virtualWindow.totalWidth - viewport.width)
  const isScrolledLeft = scrollOffset.left > 1 && pinnedLeftCols > 0
  const isScrolledRight = scrollOffset.left < maxScrollLeft - 1 && pinnedRightCols > 0

  return (
    <div
      ref={rootRef}
      className={classNames("bc-grid", `bc-grid--${density}`)}
      data-density={density}
      data-bc-grid-react="v0"
      data-scrolled-left={isScrolledLeft || undefined}
      data-scrolled-right={isScrolledRight || undefined}
      role="grid"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-rowcount={rowEntries.length + 2 + (hasAggregationFooter ? 1 : 0)}
      aria-colcount={resolvedColumns.length}
      aria-activedescendant={activeCellId}
      tabIndex={0}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      style={rootStyle(rootHeight)}
    >
      {toolbar ? <div className="bc-grid-toolbar">{toolbar}</div> : null}

      <div className="bc-grid-header-viewport" role="rowgroup" style={headerViewportStyle}>
        <div
          className="bc-grid-header"
          role="row"
          aria-rowindex={1}
          style={headerRowStyle(virtualWindow.totalWidth, headerHeight, scrollOffset.left)}
        >
          {resolvedColumns.map((column, index) =>
            renderHeaderCell({
              column,
              domBaseId,
              headerHeight,
              index,
              onColumnMenu: openColumnMenu,
              onConsumeReorderClickSuppression: consumeColumnReorderClickSuppression,
              onReorderEnd: endReorder,
              onReorderMove: handleReorderPointerMove,
              onReorderStart: handleReorderPointerDown,
              onResizeEnd: endResize,
              onResizeMove: handleResizePointerMove,
              onResizeStart: handleResizePointerDown,
              onSort: handleHeaderSort,
              pinnedEdge: pinnedEdgeFor(resolvedColumns, index),
              reorderingColumnId: columnReorderPreview?.sourceColumnId,
              scrollLeft: scrollOffset.left,
              sortState,
              totalWidth: virtualWindow.totalWidth,
              viewportWidth: viewport.width,
            }),
          )}
        </div>
        {columnReorderPreview ? (
          <div
            aria-hidden="true"
            className="bc-grid-column-drop-indicator"
            style={{
              height: headerHeight * 2,
              left: columnReorderPreview.indicatorLeft,
            }}
          />
        ) : null}
        <div
          className="bc-grid-filter-row"
          role="row"
          aria-rowindex={2}
          style={headerRowStyle(virtualWindow.totalWidth, headerHeight, scrollOffset.left)}
        >
          {resolvedColumns.map((column, index) =>
            renderFilterCell({
              column,
              domBaseId,
              filterText: columnFilterText[column.columnId] ?? "",
              headerHeight,
              index,
              onFilterChange: (next) =>
                setColumnFilterText((prev) => ({ ...prev, [column.columnId]: next })),
              pinnedEdge: pinnedEdgeFor(resolvedColumns, index),
              scrollLeft: scrollOffset.left,
              totalWidth: virtualWindow.totalWidth,
              viewportWidth: viewport.width,
            }),
          )}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="bc-grid-scroller"
        role="rowgroup"
        onScroll={handleScroll}
        style={scrollerStyle(bodyHeight)}
      >
        <div
          className="bc-grid-canvas"
          style={canvasStyle(virtualWindow.totalHeight, virtualWindow.totalWidth)}
        >
          {virtualWindow.rows.map((virtualRow) => {
            const entry = rowEntries[virtualRow.index]
            if (!entry) return null
            const disabled = isRowDisabled(entry.row)
            const selected = !disabled && isRowSelected(selectionState, entry.rowId)
            const expanded = hasDetail && expansionState.has(entry.rowId)
            const detailHeight = expanded ? getDetailHeight(entry) : 0
            const cellVirtualRow = expanded
              ? { ...virtualRow, height: defaultRowHeight }
              : virtualRow
            return (
              <div
                key={entry.rowId}
                className={classNames(
                  "bc-grid-row",
                  selected ? "bc-grid-row-selected" : undefined,
                  disabled ? "bc-grid-row-disabled" : undefined,
                )}
                role="row"
                aria-rowindex={virtualRow.index + 3}
                aria-selected={selected || undefined}
                aria-disabled={disabled || undefined}
                data-row-id={entry.rowId}
                data-row-index={virtualRow.index}
                style={rowStyle(virtualRow.top, virtualRow.height, virtualWindow.totalWidth)}
                onClick={(event) => {
                  // Selection logic. Shift+click → range from anchor; ctrl/
                  // cmd+click → toggle this row in current selection;
                  // plain click → select only this row.
                  if (!disabled) {
                    if (event.shiftKey && selectionAnchorRef.current) {
                      setSelectionState(
                        selectRange(
                          visibleSelectableRowIds,
                          selectionAnchorRef.current,
                          entry.rowId,
                        ),
                      )
                    } else if (event.ctrlKey || event.metaKey) {
                      setSelectionState(toggleRow(selectionState, entry.rowId))
                      selectionAnchorRef.current = entry.rowId
                    } else {
                      setSelectionState(selectOnly(entry.rowId))
                      selectionAnchorRef.current = entry.rowId
                    }
                  }
                  onRowClick?.(entry.row, event)
                }}
                onDoubleClick={(event) => {
                  // Activate edit on the cell at the click point if the
                  // column is editable. Falls through to onRowDoubleClick
                  // either way.
                  const target = (event.target as HTMLElement).closest<HTMLElement>(
                    "[data-column-id]",
                  )
                  const columnId = target?.dataset.columnId
                  if (!disabled && columnId) {
                    const column = resolvedColumns.find((c) => c.columnId === columnId)
                    if (column && isCellEditable(column, entry.row)) {
                      editController.start(
                        { rowId: entry.rowId, columnId: column.columnId },
                        "doubleclick",
                        { pointerHint: { x: event.clientX, y: event.clientY } },
                      )
                    }
                  }
                  onRowDoubleClick?.(entry.row, event)
                }}
              >
                {virtualWindow.cols.map((virtualCol) =>
                  renderBodyCell({
                    activeCell,
                    column: resolvedColumns[virtualCol.index],
                    domBaseId,
                    entry,
                    locale,
                    onCellFocus,
                    pinnedEdge: pinnedEdgeFor(resolvedColumns, virtualCol.index),
                    searchText,
                    scrollLeft: scrollOffset.left,
                    setActiveCell,
                    totalWidth: virtualWindow.totalWidth,
                    viewportWidth: viewport.width,
                    virtualCol,
                    virtualRow: cellVirtualRow,
                    selected,
                    disabled,
                    expanded,
                    hasOverlayValue: editController.hasOverlayValue,
                    getOverlayValue: editController.getOverlayValue,
                    getCellEditEntry: editController.getCellEditEntry,
                  }),
                )}
                {expanded && renderDetailPanel ? (
                  <div
                    className="bc-grid-detail-panel"
                    role="region"
                    aria-label="Detail"
                    style={detailPanelStyle(
                      defaultRowHeight,
                      detailHeight,
                      virtualWindow.totalWidth,
                    )}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    {renderDetailPanel({
                      row: entry.row,
                      rowId: entry.rowId,
                      rowIndex: entry.index,
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <EditorPortal
          controller={editController}
          activeCell={activeCell}
          rowEntries={rowEntries}
          resolvedColumns={resolvedColumns}
          cellRect={editorCellRect}
          virtualizer={virtualizer}
          rowIndexById={rowIndexById}
          columnIndexById={columnIndexById}
          defaultEditor={defaultTextEditor as never}
        />

        {loading ? (
          <div className="bc-grid-overlay" role="status" style={overlayStyle}>
            {loadingOverlay ?? messages.loadingLabel}
          </div>
        ) : null}

        {!loading && rowEntries.length === 0 ? (
          <div className="bc-grid-overlay" role="status" style={overlayStyle}>
            {messages.noRowsLabel}
          </div>
        ) : null}
      </div>

      {hasAggregationFooter ? (
        <BcGridAggregationFooterRow
          columns={resolvedColumns}
          locale={locale}
          results={aggregationResults}
          rowHeight={defaultRowHeight}
          rowIndex={rowEntries.length + 3}
          scrollLeft={scrollOffset.left}
          totalWidth={virtualWindow.totalWidth}
          viewportWidth={viewport.width}
        />
      ) : null}

      {props.statusBar && props.statusBar.length > 0 ? (
        <BcStatusBar
          segments={props.statusBar}
          ctx={statusBarContext}
          ariaLabel={messages.statusBarLabel}
        />
      ) : null}

      {columnMenu ? (
        <ColumnVisibilityMenu
          anchor={columnMenu}
          items={columnVisibilityItems}
          onClose={closeColumnMenu}
          onToggle={toggleColumnHidden}
        />
      ) : null}

      {renderedFooter ? <div className="bc-grid-footer">{renderedFooter}</div> : null}

      {/*
       * Live regions per accessibility-rfc §Live Regions. Visually hidden
       * but exposed to assistive tech. Polite for sort / filter / selection
       * state changes; assertive for errors that need user action (Q2 cell-
       * edit-rejected).
       */}
      <div
        data-bc-grid-status="true"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={visuallyHiddenStyle}
      >
        {politeMessage}
      </div>
      <div
        data-bc-grid-alert="true"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        style={visuallyHiddenStyle}
      >
        {assertiveMessage}
      </div>
    </div>
  )
}

/**
 * Activation guard per `editing-rfc §Activation guards`. The column may
 * declare `editable` as a boolean or a row-fn; default false (read-only).
 */
function isCellEditable<TRow>(
  column: { source: { editable?: boolean | ((row: TRow) => boolean) } },
  row: TRow,
): boolean {
  const editable = column.source.editable
  if (typeof editable === "function") return editable(row)
  return editable === true
}

/**
 * Selected-row count for the status bar across selection modes:
 * `explicit` → set size; `all`/`filtered` → population minus exceptions.
 */
function computeSelectedRowCount(
  selection: BcSelection,
  totalRows: number,
  filteredRows: number,
): number {
  if (selection.mode === "explicit") return selection.rowIds.size
  const population = selection.mode === "all" ? totalRows : filteredRows
  return Math.max(0, population - selection.except.size)
}

function buildColumnVisibilityItems<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): readonly ColumnVisibilityItem[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  const items = columns.map((column, index) => {
    const columnId = columnIdFor(column, index)
    const hidden = stateById.get(columnId)?.hidden ?? column.hidden ?? false
    return {
      columnId,
      hidden,
      label: columnVisibilityLabel(column, columnId),
    }
  })
  const visibleCount = items.filter((item) => !item.hidden).length
  return items.map((item) => ({
    ...item,
    hideDisabled: !item.hidden && visibleCount <= 1,
  }))
}

function columnVisibilityLabel<TRow>(column: BcReactGridColumn<TRow>, columnId: ColumnId): string {
  return typeof column.header === "string" ? column.header : columnId
}

function detailPanelStyle(top: number, height: number, width: number): CSSProperties {
  return {
    height,
    left: 0,
    minWidth: "100%",
    overflow: "auto",
    position: "absolute",
    top,
    width: Math.max(width, 1),
  }
}
