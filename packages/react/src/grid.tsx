import type {
  BcCellPosition,
  BcColumnStateEntry,
  BcGridApi,
  BcGridFilter,
  BcGridSort,
  BcSelection,
  RowId,
} from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import {
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
import { renderBodyCell } from "./bodyCells"
import { type ColumnFilterText, buildGridFilter, matchesGridFilter } from "./filter"
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
  createEmptySelection,
  defaultMessages,
  deriveColumnState,
  domToken,
  hasProp,
  headerRowStyle,
  headerViewportStyle,
  overlayStyle,
  resolveColumns,
  resolveFallbackBodyHeight,
  resolveHeaderHeight,
  resolveRowHeight,
  rootStyle,
  rowStyle,
  scrollerStyle,
  useColumnResize,
  useControlledState,
  useFlipOnSort,
  useLiveRegionAnnouncements,
  useViewportSync,
  visuallyHiddenStyle,
} from "./gridInternals"
import { renderFilterCell, renderHeaderCell } from "./headerCells"
import { nextKeyboardNav } from "./keyboard"
import { isRowSelected, selectOnly, selectRange, toggleRow } from "./selection"
import { defaultCompareValues, toggleSortFor } from "./sort"
import type { BcGridProps } from "./types"
import { formatCellValue, getCellValue } from "./value"

export function useBcGridApi<TRow>(): RefObject<BcGridApi<TRow> | null> {
  return useRef<BcGridApi<TRow> | null>(null)
}

export function BcGrid<TRow>(props: BcGridProps<TRow>): ReactNode {
  assertNoMixedControlledProps(props)

  const {
    data,
    columns,
    rowId,
    apiRef,
    density = "normal",
    height,
    rowHeight,
    rowIsInactive,
    locale,
    toolbar,
    footer,
    loading,
    loadingOverlay,
    ariaLabel,
    ariaLabelledBy,
    onRowClick,
    onRowDoubleClick,
    onCellFocus,
  } = props

  const messages = useMemo(() => ({ ...defaultMessages, ...props.messages }), [props.messages])
  const instanceId = useId()
  const domBaseId = useMemo(
    () => `bc-grid-${domToken(props.gridId ?? instanceId)}`,
    [props.gridId, instanceId],
  )

  const defaultRowHeight = resolveRowHeight(density, rowHeight)
  const headerHeight = resolveHeaderHeight(density)
  const fallbackBodyHeight = resolveFallbackBodyHeight(height, defaultRowHeight, headerHeight)

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

  const [sortState, setSortState] = useControlledState<readonly BcGridSort[]>(
    hasProp(props, "sort"),
    props.sort ?? [],
    props.defaultSort ?? [],
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

  // Anchor for shift-click range selection. Set on plain click + ctrl/cmd
  // click; consumed (and reset) by shift-click. Held in a ref so we don't
  // re-render the grid just to update the anchor.
  const selectionAnchorRef = useRef<RowId | null>(null)

  const [columnState, setColumnState] = useControlledState<readonly BcColumnStateEntry[]>(
    hasProp(props, "columnState"),
    props.columnState ?? [],
    props.defaultColumnState ?? [],
    props.onColumnStateChange,
  )
  const [activeCell, setActiveCell] = useControlledState<BcCellPosition | null>(
    hasProp(props, "activeCell"),
    props.activeCell ?? null,
    props.defaultActiveCell ?? null,
    props.onActiveCellChange,
  )

  const resolvedColumns = useMemo(
    () => resolveColumns(columns, columnState),
    [columns, columnState],
  )

  const columnIndexById = useMemo(() => {
    const map = new Map<(typeof resolvedColumns)[number]["columnId"], number>()
    resolvedColumns.forEach((column, index) => map.set(column.columnId, index))
    return map
  }, [resolvedColumns])

  const activeFilter = useMemo(() => buildGridFilter(columnFilterText), [columnFilterText])

  const rowEntries = useMemo<readonly RowEntry<TRow>[]>(() => {
    let visibleRows: TRow[] =
      props.showInactive === false && rowIsInactive
        ? data.filter((row) => !rowIsInactive(row))
        : [...data]

    // Filter step: pass the row's per-column formatted values to the
    // matcher. We use formatted values (not raw) so the result matches
    // what the user sees in the cell.
    if (activeFilter) {
      const columnsById = new Map(resolvedColumns.map((c) => [c.columnId, c]))
      visibleRows = visibleRows.filter((row) =>
        matchesGridFilter(activeFilter, (columnId) => {
          const column = columnsById.get(columnId)
          if (!column) return ""
          const value = getCellValue(row, column.source)
          return formatCellValue(value, row, column.source, locale)
        }),
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
        const column = resolvedColumns.find((c) => c.columnId === sort.columnId)
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
    resolvedColumns,
    rowId,
    rowIsInactive,
    sortState,
  ])

  // Surface activeFilter through the controlled setFilterState contract so
  // consumers using the `filter` prop see the canonical BcGridFilter shape
  // when the user types.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setFilterState identity isn't useful here
  useEffect(() => {
    if (activeFilter) setFilterState(activeFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter])

  const { politeMessage } = useLiveRegionAnnouncements({
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
    next.setScrollTop(scrollOffsetRef.current.top)
    next.setScrollLeft(scrollOffsetRef.current.left)
    return next
  }, [
    defaultRowHeight,
    fallbackBodyHeight,
    pinnedLeftCols,
    pinnedRightCols,
    resolvedColumns,
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
      expandAll() {},
      collapseAll() {},
      refresh() {
        requestRender()
      },
    }),
    [
      activeCell,
      columnIndexById,
      columnState,
      focusCell,
      requestRender,
      resolvedColumns,
      rowIndexById,
      rowsById,
      scrollToCell,
      scrollToRow,
      selectionState,
      setColumnState,
      setFilterState,
      setSortState,
      virtualizer,
    ],
  )

  useEffect(() => assignRef(apiRef, api), [apiRef, api])

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

      const currentRow = activeCell ? (rowIndexById.get(activeCell.rowId) ?? 0) : 0
      const currentCol = activeCell ? (columnIndexById.get(activeCell.columnId) ?? 0) : 0

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

      const nextRow = rowEntries[outcome.row]
      const nextColumn = resolvedColumns[outcome.col]
      if (!nextRow || !nextColumn) return
      focusCell({ rowId: nextRow.rowId, columnId: nextColumn.columnId })
    },
    [
      activeCell,
      columnIndexById,
      focusCell,
      pageRowCount,
      resolvedColumns,
      rowEntries,
      rowIndexById,
    ],
  )

  const { prepareSortAnimation } = useFlipOnSort({ sortState, scrollerRef, virtualizer })

  const handleHeaderSort = useCallback(
    (column: {
      columnId: (typeof resolvedColumns)[number]["columnId"]
      source: (typeof resolvedColumns)[number]["source"]
    }) => {
      if (column.source.sortable === false) return
      prepareSortAnimation()
      setSortState(toggleSortFor(sortState, column.columnId))
    },
    [prepareSortAnimation, setSortState, sortState],
  )

  const { handleResizePointerDown, handleResizePointerMove, endResize } = useColumnResize<TRow>({
    columnState,
    setColumnState,
  })

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
      aria-rowcount={rowEntries.length + 2}
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
              onResizeEnd: endResize,
              onResizeMove: handleResizePointerMove,
              onResizeStart: handleResizePointerDown,
              onSort: handleHeaderSort,
              scrollLeft: scrollOffset.left,
              sortState,
              totalWidth: virtualWindow.totalWidth,
              viewportWidth: viewport.width,
            }),
          )}
        </div>
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
            const selected = isRowSelected(selectionState, entry.rowId)
            return (
              <div
                key={entry.rowId}
                className={classNames("bc-grid-row", selected ? "bc-grid-row-selected" : undefined)}
                role="row"
                aria-rowindex={virtualRow.index + 3}
                aria-selected={selected || undefined}
                data-row-id={entry.rowId}
                data-row-index={virtualRow.index}
                style={rowStyle(virtualRow.top, virtualRow.height, virtualWindow.totalWidth)}
                onClick={(event) => {
                  // Selection logic. Shift+click → range from anchor; ctrl/
                  // cmd+click → toggle this row in current selection;
                  // plain click → select only this row.
                  if (event.shiftKey && selectionAnchorRef.current) {
                    setSelectionState(
                      selectRange(
                        rowEntries.map((e) => e.rowId),
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
                  onRowClick?.(entry.row, event)
                }}
                onDoubleClick={(event) => onRowDoubleClick?.(entry.row, event)}
              >
                {virtualWindow.cols.map((virtualCol) =>
                  renderBodyCell({
                    activeCell,
                    column: resolvedColumns[virtualCol.index],
                    domBaseId,
                    entry,
                    locale,
                    onCellFocus,
                    searchText: props.searchText ?? props.defaultSearchText ?? "",
                    scrollLeft: scrollOffset.left,
                    setActiveCell,
                    totalWidth: virtualWindow.totalWidth,
                    viewportWidth: viewport.width,
                    virtualCol,
                    virtualRow,
                    selected,
                  }),
                )}
              </div>
            )
          })}
        </div>

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

      {footer ? <div className="bc-grid-footer">{footer}</div> : null}

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
      />
    </div>
  )
}
