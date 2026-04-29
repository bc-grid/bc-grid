import type {
  BcCellPosition,
  BcColumnStateEntry,
  BcGridApi,
  BcGridFilter,
  BcGridSort,
  BcSelection,
  BcServerGridApi,
  ColumnId,
  RowId,
  ServerBlockKey,
  ServerInvalidation,
  ServerRowModelMode,
  ServerRowModelState,
  ServerSelection,
  ServerViewState,
} from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import {
  type CSSProperties,
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
import type {
  BcCellRendererParams,
  BcEditGridAction,
  BcEditGridProps,
  BcGridColumn,
  BcGridDensity,
  BcGridMessages,
  BcGridProps,
  BcReactGridColumn,
  BcServerGridProps,
} from "./types"
import { formatCellValue, getCellValue } from "./value"

const DEFAULT_COL_WIDTH = 120
const DEFAULT_VIEWPORT_WIDTH = 800
const DEFAULT_BODY_HEIGHT = 360

const densityRowHeights: Record<BcGridDensity, number> = {
  compact: 28,
  normal: 36,
  comfortable: 44,
}

const densityHeaderHeights: Record<BcGridDensity, number> = {
  compact: 34,
  normal: 40,
  comfortable: 48,
}

const defaultMessages: BcGridMessages = {
  noRowsLabel: "No rows",
  loadingLabel: "Loading",
  actionColumnLabel: "Actions",
  editLabel: "Edit",
  deleteLabel: "Delete",
}

interface RowEntry<TRow> {
  row: TRow
  rowId: RowId
  index: number
}

interface ResolvedColumn<TRow> {
  source: BcReactGridColumn<TRow, unknown>
  columnId: ColumnId
  left: number
  width: number
  align: "left" | "right" | "center"
  pinned: "left" | "right" | null
  position: number
}

interface ViewportSize {
  height: number
  width: number
}

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

  const defaultRowHeight = rowHeight ?? densityRowHeights[density]
  const headerHeight = densityHeaderHeights[density]
  const fallbackBodyHeight =
    typeof height === "number"
      ? Math.max(defaultRowHeight, height - headerHeight)
      : DEFAULT_BODY_HEIGHT

  const [viewport, setViewport] = useState<ViewportSize>({
    height: fallbackBodyHeight,
    width: DEFAULT_VIEWPORT_WIDTH,
  })
  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 })
  const [, setRenderVersion] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const requestRender = useCallback(() => {
    setRenderVersion((version) => (version + 1) % Number.MAX_SAFE_INTEGER)
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
  const [selectionState] = useControlledState<BcSelection>(
    hasProp(props, "selection"),
    props.selection ?? createEmptySelection(),
    props.defaultSelection ?? createEmptySelection(),
    props.onSelectionChange,
  )
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

  const rowEntries = useMemo(() => {
    const visibleRows =
      props.showInactive === false && rowIsInactive
        ? data.filter((row) => !rowIsInactive(row))
        : [...data]

    return visibleRows.map((row, index) => ({
      row,
      index,
      rowId: rowId(row, index),
    }))
  }, [data, props.showInactive, rowId, rowIsInactive])

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

  const resolvedColumns = useMemo(
    () => resolveColumns(columns, columnState),
    [columns, columnState],
  )

  const columnIndexById = useMemo(() => {
    const map = new Map<ColumnId, number>()
    resolvedColumns.forEach((column, index) => map.set(column.columnId, index))
    return map
  }, [resolvedColumns])

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
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
      pinnedLeftCols,
      pinnedRightCols,
    })

    resolvedColumns.forEach((column, index) => next.setColWidth(index, column.width))
    return next
  }, [
    defaultRowHeight,
    pinnedLeftCols,
    pinnedRightCols,
    resolvedColumns,
    rowEntries.length,
    viewport.height,
    viewport.width,
  ])

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

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    let frame = 0
    const syncViewport = () => {
      frame = 0
      const nextViewport = {
        height: scroller.clientHeight || fallbackBodyHeight,
        width: scroller.clientWidth || DEFAULT_VIEWPORT_WIDTH,
      }
      virtualizer.setViewport(nextViewport.height, nextViewport.width)
      setViewport(nextViewport)
      requestRender()
    }

    syncViewport()

    if (typeof ResizeObserver === "undefined") return undefined

    const resizeObserver = new ResizeObserver(() => {
      if (frame !== 0) return
      frame = requestAnimationFrame(syncViewport)
    })
    resizeObserver.observe(scroller)

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
    }
  }, [fallbackBodyHeight, requestRender, virtualizer])

  const virtualWindow = virtualizer.computeWindow()

  const scrollToRow = useCallback(
    (targetRowId: RowId, align: "start" | "center" | "end" | "nearest" = "nearest") => {
      const rowIndex = rowIndexById.get(targetRowId)
      if (rowIndex == null) return
      const top = virtualizer.scrollOffsetForRow(rowIndex, align)
      applyScroll(scrollerRef.current, virtualizer, top, undefined, setScrollOffset)
    },
    [rowIndexById, virtualizer],
  )

  const scrollToCell = useCallback(
    (position: BcCellPosition, align: "start" | "center" | "end" | "nearest" = "nearest") => {
      const rowIndex = rowIndexById.get(position.rowId)
      const colIndex = columnIndexById.get(position.columnId)
      if (rowIndex == null || colIndex == null) return
      const top = virtualizer.scrollOffsetForRow(rowIndex, align)
      const left = virtualizer.scrollOffsetForCol(colIndex, align)
      applyScroll(scrollerRef.current, virtualizer, top, left, setScrollOffset)
    },
    [columnIndexById, rowIndexById, virtualizer],
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
      setScrollOffset({ top: target.scrollTop, left: target.scrollLeft })
    },
    [virtualizer],
  )

  const handleFocus = useCallback(() => {
    if (activeCell || rowEntries.length === 0 || resolvedColumns.length === 0) return
    const firstRow = rowEntries[0]
    const firstColumn = resolvedColumns[0]
    if (!firstRow || !firstColumn) return
    setActiveCell({ rowId: firstRow.rowId, columnId: firstColumn.columnId })
  }, [activeCell, resolvedColumns, rowEntries, setActiveCell])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const keyToDelta: Record<string, { row: number; col: number } | undefined> = {
        ArrowUp: { row: -1, col: 0 },
        ArrowDown: { row: 1, col: 0 },
        ArrowLeft: { row: 0, col: -1 },
        ArrowRight: { row: 0, col: 1 },
      }
      const delta = keyToDelta[event.key]
      if (!delta) return
      event.preventDefault()

      const currentRowIndex = activeCell ? (rowIndexById.get(activeCell.rowId) ?? 0) : 0
      const currentColIndex = activeCell ? (columnIndexById.get(activeCell.columnId) ?? 0) : 0
      const nextRowIndex = clamp(currentRowIndex + delta.row, 0, rowEntries.length - 1)
      const nextColIndex = clamp(currentColIndex + delta.col, 0, resolvedColumns.length - 1)
      const nextRow = rowEntries[nextRowIndex]
      const nextColumn = resolvedColumns[nextColIndex]
      if (!nextRow || !nextColumn) return
      focusCell({ rowId: nextRow.rowId, columnId: nextColumn.columnId })
    },
    [activeCell, columnIndexById, focusCell, resolvedColumns, rowEntries, rowIndexById],
  )

  return (
    <div
      ref={rootRef}
      className={classNames("bc-grid", `bc-grid--${density}`)}
      data-density={density}
      data-bc-grid-react="v0"
      role="grid"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-rowcount={rowEntries.length + 1}
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
              scrollLeft: scrollOffset.left,
              sortState,
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
                className="bc-grid-row"
                role="row"
                aria-rowindex={virtualRow.index + 2}
                aria-selected={selected || undefined}
                data-row-id={entry.rowId}
                style={rowStyle(virtualRow.top, virtualRow.height, virtualWindow.totalWidth)}
                onClick={(event) => onRowClick?.(entry.row, event)}
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
    </div>
  )
}

export function BcEditGrid<TRow>(props: BcEditGridProps<TRow>): ReactNode {
  const {
    columns,
    detailPath,
    linkField,
    hideActions,
    onEdit,
    onDelete,
    canEdit,
    canDelete,
    extraActions,
    editLabel = defaultMessages.editLabel,
    deleteLabel = defaultMessages.deleteLabel,
  } = props

  const editColumns = useMemo(() => {
    const nextColumns = columns.map((column) => {
      if (!detailPath || !linkField || column.field !== linkField) return column
      return {
        ...column,
        cellRenderer(params) {
          const href = `${detailPath}/${encodeURIComponent(params.rowId)}`
          return (
            <a className="bc-grid-link" href={href}>
              {params.formattedValue}
            </a>
          )
        },
      } satisfies BcGridColumn<TRow>
    })

    const hasActions = Boolean(onEdit || onDelete || extraActions)
    if (hideActions || !hasActions) return nextColumns

    return [
      ...nextColumns,
      createActionsColumn({
        canDelete,
        canEdit,
        deleteLabel,
        editLabel,
        extraActions,
        onDelete,
        onEdit,
      }),
    ]
  }, [
    canDelete,
    canEdit,
    columns,
    deleteLabel,
    detailPath,
    editLabel,
    extraActions,
    hideActions,
    linkField,
    onDelete,
    onEdit,
  ])

  return <BcGrid {...props} columns={editColumns} />
}

export function BcServerGrid<TRow>(props: BcServerGridProps<TRow>): ReactNode {
  const gridApiRef = useBcGridApi<TRow>()
  const rows = serverRows(props)
  const externalApiRef = props.apiRef
  const visibleColumns = useMemo(
    () =>
      props.columns
        .filter((column) => !column.hidden)
        .map((column, index) => column.columnId ?? column.field ?? `column-${index}`),
    [props.columns],
  )

  const serverApi = useMemo<BcServerGridApi<TRow>>(() => {
    const mode = props.rowModel
    const view = createServerViewState(visibleColumns, props.locale)

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
      refreshServerRows() {
        gridApiRef.current?.refresh()
      },
      invalidateServerRows(_invalidation: ServerInvalidation) {},
      retryServerBlock(_blockKey: ServerBlockKey) {},
      getServerRowModelState() {
        return createServerRowModelState({
          mode,
          rowCount: serverRowCount(props),
          selection: toServerSelection(gridApiRef.current?.getSelection(), view),
          view,
        })
      },
    }
  }, [gridApiRef, props, visibleColumns])

  useEffect(() => assignRef(externalApiRef, serverApi), [externalApiRef, serverApi])

  const gridProps = props as unknown as BcGridProps<TRow>
  return (
    <BcGrid
      {...gridProps}
      data={rows}
      apiRef={gridApiRef}
      loading={props.loading ?? props.rowModel !== "paged"}
    />
  )
}

interface RenderHeaderCellParams<TRow> {
  column: ResolvedColumn<TRow>
  domBaseId: string
  headerHeight: number
  index: number
  scrollLeft: number
  sortState: readonly BcGridSort[]
  totalWidth: number
  viewportWidth: number
}

function renderHeaderCell<TRow>({
  column,
  domBaseId,
  headerHeight,
  index,
  scrollLeft,
  sortState,
  totalWidth,
  viewportWidth,
}: RenderHeaderCellParams<TRow>) {
  const sort = sortState.find((entry) => entry.columnId === column.columnId)
  return (
    <div
      key={column.columnId}
      id={headerDomId(domBaseId, column.columnId)}
      className={classNames(
        "bc-grid-cell",
        "bc-grid-header-cell",
        column.align === "right" ? "bc-grid-cell-right" : undefined,
      )}
      role="columnheader"
      aria-colindex={index + 1}
      aria-sort={sort ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
      style={cellStyle({
        align: column.align,
        height: headerHeight,
        left: column.left,
        pinned: column.pinned,
        scrollLeft,
        totalWidth,
        viewportWidth,
        width: column.width,
      })}
    >
      {column.source.header}
    </div>
  )
}

interface RenderBodyCellParams<TRow> {
  activeCell: BcCellPosition | null
  column: ResolvedColumn<TRow> | undefined
  domBaseId: string
  entry: RowEntry<TRow>
  locale: string | undefined
  onCellFocus: ((position: BcCellPosition) => void) | undefined
  scrollLeft: number
  searchText: string
  selected: boolean
  setActiveCell: (next: BcCellPosition | null) => void
  totalWidth: number
  viewportWidth: number
  virtualCol: { index: number; left: number; width: number; pinned: "left" | "right" | null }
  virtualRow: { height: number }
}

function renderBodyCell<TRow>({
  activeCell,
  column,
  domBaseId,
  entry,
  locale,
  onCellFocus,
  scrollLeft,
  searchText,
  selected,
  setActiveCell,
  totalWidth,
  viewportWidth,
  virtualCol,
  virtualRow,
}: RenderBodyCellParams<TRow>) {
  if (!column) return null

  const value = getCellValue(entry.row, column.source)
  const formattedValue = formatCellValue(value, entry.row, column.source, locale)
  const rowState = {
    rowId: entry.rowId,
    index: entry.index,
    selected,
  }
  const params = {
    value,
    formattedValue,
    row: entry.row,
    rowId: entry.rowId,
    column: column.source,
    searchText,
    rowState,
    editing: false,
  } satisfies BcCellRendererParams<TRow, unknown>
  const position = { rowId: entry.rowId, columnId: column.columnId }
  const active = activeCell?.rowId === position.rowId && activeCell.columnId === position.columnId
  const coreClassName =
    typeof column.source.cellClass === "function"
      ? column.source.cellClass(value, entry.row)
      : column.source.cellClass
  const reactClassName =
    typeof column.source.cellClassName === "function"
      ? column.source.cellClassName(params)
      : column.source.cellClassName
  const customStyle =
    typeof column.source.cellStyle === "function"
      ? column.source.cellStyle(params)
      : column.source.cellStyle
  const role = column.source.rowHeader ? "rowheader" : "gridcell"

  return (
    <div
      key={column.columnId}
      id={cellDomId(domBaseId, entry.rowId, column.columnId)}
      className={classNames(
        "bc-grid-cell",
        column.align === "right" ? "bc-grid-cell-right" : undefined,
        active ? "bc-grid-cell-active" : undefined,
        coreClassName,
        reactClassName,
      )}
      role={role}
      aria-colindex={virtualCol.index + 1}
      aria-labelledby={`${headerDomId(domBaseId, column.columnId)} ${cellDomId(
        domBaseId,
        entry.rowId,
        column.columnId,
      )}`}
      aria-selected={selected || undefined}
      data-bc-grid-active-cell={active || undefined}
      style={{
        ...cellStyle({
          align: column.align,
          height: virtualRow.height,
          left: virtualCol.left,
          pinned: virtualCol.pinned,
          scrollLeft,
          totalWidth,
          viewportWidth,
          width: virtualCol.width,
        }),
        ...customStyle,
      }}
      onClick={() => {
        setActiveCell(position)
        onCellFocus?.(position)
      }}
    >
      {column.source.cellRenderer ? column.source.cellRenderer(params) : formattedValue}
    </div>
  )
}

interface CellStyleParams {
  align: "left" | "right" | "center"
  height: number
  left: number
  pinned: "left" | "right" | null
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
  width: number
}

function cellStyle({
  align,
  height,
  left,
  pinned,
  scrollLeft,
  totalWidth,
  viewportWidth,
  width,
}: CellStyleParams): CSSProperties {
  return {
    alignItems: "center",
    display: "flex",
    height,
    justifyContent: alignToJustify(align),
    left,
    minWidth: 0,
    overflow: "hidden",
    paddingInline: "var(--bc-grid-cell-padding-x, 12px)",
    position: "absolute",
    textAlign: align,
    textOverflow: "ellipsis",
    top: 0,
    transform: pinnedTransformValue(pinned, scrollLeft, totalWidth, viewportWidth),
    whiteSpace: "nowrap",
    width,
    zIndex: pinned ? 2 : 1,
  }
}

function rootStyle(height: number | undefined): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    height,
    minHeight: height ? undefined : 0,
    outline: "none",
    position: "relative",
  }
}

const headerViewportStyle: CSSProperties = {
  flex: "0 0 auto",
  overflow: "hidden",
  position: "relative",
}

function headerRowStyle(width: number, height: number, scrollLeft: number): CSSProperties {
  return {
    height,
    minWidth: "100%",
    position: "relative",
    transform: `translate3d(${-scrollLeft}px, 0, 0)`,
    width: Math.max(width, 1),
  }
}

function scrollerStyle(height: number | undefined): CSSProperties {
  return {
    flex: height == null ? "1 1 auto" : "0 0 auto",
    height,
    minHeight: height == null ? 0 : undefined,
    overflow: "auto",
    position: "relative",
  }
}

function canvasStyle(height: number, width: number): CSSProperties {
  return {
    height: Math.max(height, 1),
    minWidth: "100%",
    position: "relative",
    width: Math.max(width, 1),
  }
}

function rowStyle(top: number, height: number, width: number): CSSProperties {
  return {
    height,
    minWidth: "100%",
    position: "absolute",
    transform: `translate3d(0, ${top}px, 0)`,
    width: Math.max(width, 1),
  }
}

const overlayStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  pointerEvents: "none",
  position: "absolute",
}

function resolveColumns<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): ResolvedColumn<TRow>[] {
  const stateById = new Map(columnState.map((entry) => [entry.columnId, entry]))
  const resolved = columns.flatMap((column, originalIndex) => {
    const columnId = column.columnId ?? column.field ?? `column-${originalIndex}`
    const state = stateById.get(columnId)
    if (state?.hidden ?? column.hidden) return []

    const pinned = state?.pinned === null ? null : (state?.pinned ?? column.pinned ?? null)
    const requestedWidth = state?.width ?? column.width ?? DEFAULT_COL_WIDTH
    const minWidth = column.minWidth ?? 48
    const maxWidth = column.maxWidth ?? Number.POSITIVE_INFINITY
    const width = clamp(requestedWidth, minWidth, maxWidth)
    return [
      {
        align: column.align ?? "left",
        columnId,
        left: 0,
        pinned,
        position: state?.position ?? originalIndex,
        source: column,
        width,
      } satisfies ResolvedColumn<TRow>,
    ]
  })

  const byPosition = (a: ResolvedColumn<TRow>, b: ResolvedColumn<TRow>) => a.position - b.position
  const ordered = [
    ...resolved.filter((column) => column.pinned === "left").sort(byPosition),
    ...resolved.filter((column) => column.pinned === null).sort(byPosition),
    ...resolved.filter((column) => column.pinned === "right").sort(byPosition),
  ]

  let left = 0
  return ordered.map((column) => {
    const next = { ...column, left }
    left += column.width
    return next
  })
}

function deriveColumnState<TRow>(
  resolvedColumns: readonly ResolvedColumn<TRow>[],
  columnState: readonly BcColumnStateEntry[],
): BcColumnStateEntry[] {
  if (columnState.length > 0) return [...columnState]
  return resolvedColumns.map((column, position) => ({
    columnId: column.columnId,
    pinned: column.pinned,
    position,
    width: column.width,
  }))
}

function createActionsColumn<TRow>(options: {
  canDelete: ((row: TRow) => boolean) | undefined
  canEdit: ((row: TRow) => boolean) | undefined
  deleteLabel: string
  editLabel: string
  extraActions: BcEditGridProps<TRow>["extraActions"]
  onDelete: ((row: TRow) => void) | undefined
  onEdit: ((row: TRow) => void) | undefined
}): BcGridColumn<TRow> {
  return {
    columnId: "__bc_actions",
    header: defaultMessages.actionColumnLabel,
    pinned: "right",
    width: 180,
    sortable: false,
    resizable: false,
    cellRenderer(params) {
      const actions: BcEditGridAction<TRow>[] = []
      if (options.onEdit) {
        actions.push({
          label: options.editLabel,
          onSelect: options.onEdit,
          disabled: options.canEdit ? !options.canEdit(params.row) : false,
        })
      }
      if (options.onDelete) {
        actions.push({
          label: options.deleteLabel,
          onSelect: options.onDelete,
          destructive: true,
          disabled: options.canDelete ? !options.canDelete(params.row) : false,
        })
      }
      const extra =
        typeof options.extraActions === "function"
          ? options.extraActions(params.row)
          : (options.extraActions ?? [])

      return (
        <div className="bc-grid-actions" style={actionsStyle}>
          {[...actions, ...extra].map((action) => (
            <button
              key={action.label}
              type="button"
              className={classNames(
                "bc-grid-action",
                action.destructive ? "bc-grid-action-destructive" : undefined,
              )}
              disabled={isActionDisabled(action, params.row)}
              onClick={(event) => {
                event.stopPropagation()
                action.onSelect(params.row)
              }}
            >
              {action.icon ? <action.icon className="bc-grid-action-icon" /> : null}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      )
    },
  }
}

const actionsStyle: CSSProperties = {
  display: "flex",
  gap: "0.25rem",
  minWidth: 0,
}

function isActionDisabled<TRow>(action: BcEditGridAction<TRow>, row: TRow): boolean {
  return typeof action.disabled === "function" ? action.disabled(row) : (action.disabled ?? false)
}

function serverRows<TRow>(props: BcServerGridProps<TRow>): readonly TRow[] {
  if (props.rowModel === "paged") return props.initialResult?.rows ?? []
  return []
}

function serverRowCount<TRow>(props: BcServerGridProps<TRow>): number | "unknown" {
  if (props.rowModel === "paged") return props.initialResult?.totalRows ?? 0
  return "unknown"
}

function createServerViewState(
  visibleColumns: readonly ColumnId[],
  locale: string | undefined,
): ServerViewState {
  return {
    groupBy: [],
    sort: [],
    visibleColumns: [...visibleColumns],
    ...(locale ? { locale } : {}),
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

function applyScroll(
  scroller: HTMLDivElement | null,
  virtualizer: Virtualizer,
  top: number | undefined,
  left: number | undefined,
  setScrollOffset: (next: { top: number; left: number }) => void,
): void {
  if (!scroller) return
  if (top != null) scroller.scrollTop = top
  if (left != null) scroller.scrollLeft = left
  virtualizer.setScrollTop(scroller.scrollTop)
  virtualizer.setScrollLeft(scroller.scrollLeft)
  setScrollOffset({ top: scroller.scrollTop, left: scroller.scrollLeft })
}

function useControlledState<T>(
  controlled: boolean,
  controlledValue: T,
  defaultValue: T,
  onChange: ((next: T, prev: T) => void) | undefined,
): [T, (next: T) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const value = controlled ? controlledValue : uncontrolledValue
  const setValue = useCallback(
    (next: T) => {
      const prev = controlled ? controlledValue : uncontrolledValue
      if (Object.is(prev, next)) return
      if (!controlled) setUncontrolledValue(next)
      onChange?.(next, prev)
    },
    [controlled, controlledValue, onChange, uncontrolledValue],
  )
  return [value, setValue]
}

function assertNoMixedControlledProps<TRow>(props: BcGridProps<TRow>): void {
  const pairs: Array<[keyof BcGridProps<TRow>, keyof BcGridProps<TRow>]> = [
    ["sort", "defaultSort"],
    ["searchText", "defaultSearchText"],
    ["filter", "defaultFilter"],
    ["selection", "defaultSelection"],
    ["expansion", "defaultExpansion"],
    ["groupBy", "defaultGroupBy"],
    ["columnState", "defaultColumnState"],
    ["activeCell", "defaultActiveCell"],
    ["page", "defaultPage"],
    ["pageSize", "defaultPageSize"],
  ]

  for (const [controlled, uncontrolled] of pairs) {
    if (hasProp(props, controlled) && hasProp(props, uncontrolled)) {
      throw new Error(
        `BcGrid received both ${String(controlled)} and ${String(
          uncontrolled,
        )}. Use either controlled or uncontrolled state for a pair, not both.`,
      )
    }
  }
}

function assignRef<T>(ref: RefObject<T | null> | undefined, value: T): () => void {
  if (!ref) return () => {}
  ref.current = value
  return () => {
    if (ref.current === value) ref.current = null
  }
}

function createEmptySelection(): BcSelection {
  return { mode: "explicit", rowIds: new Set<RowId>() }
}

function isRowSelected(selection: BcSelection, rowId: RowId): boolean {
  if (selection.mode === "explicit") return selection.rowIds.has(rowId)
  return !selection.except.has(rowId)
}

function classNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(" ")
}

function hasProp(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function domToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function headerDomId(baseId: string, columnId: ColumnId): string {
  return `${baseId}-header-${domToken(columnId)}`
}

function cellDomId(baseId: string, rowId: RowId, columnId: ColumnId): string {
  return `${baseId}-cell-${domToken(rowId)}-${domToken(columnId)}`
}

function alignToJustify(align: "left" | "right" | "center"): CSSProperties["justifyContent"] {
  if (align === "right") return "flex-end"
  if (align === "center") return "center"
  return "flex-start"
}

function pinnedTransformValue(
  pinned: "left" | "right" | null,
  scrollLeft: number,
  totalWidth: number,
  viewportWidth: number,
): string | undefined {
  if (pinned === "left") return `translate3d(${scrollLeft}px, 0, 0)`
  if (pinned === "right") {
    return `translate3d(${scrollLeft + viewportWidth - totalWidth}px, 0, 0)`
  }
  return undefined
}
