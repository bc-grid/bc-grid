import type { BcPivotCell, BcPivotedData } from "@bc-grid/aggregations"
import type { BcPivotState, ColumnId } from "@bc-grid/core"
import { Virtualizer } from "@bc-grid/virtualizer"
import {
  type ReactNode,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { formatAggregationResult } from "./aggregations"
import {
  DEFAULT_COL_WIDTH,
  canvasStyle,
  cellStyle,
  classNames,
  columnIdFor,
  headerRowStyle,
  headerViewportStyle,
  rowStyle,
  scrollerStyle,
  useViewportSync,
} from "./gridInternals"
import type { BcReactGridColumn } from "./types"

const PIVOT_AXIS_WIDTH = 220
const PIVOT_VALUE_WIDTH = 132

export interface PivotViewModel<TRow> {
  rows: readonly PivotDisplayRow[]
  columns: readonly PivotDisplayColumn<TRow>[]
  headerRows: readonly (readonly PivotHeaderCell[])[]
  headerRowCount: number
  totalWidth: number
  cellByKey: ReadonlyMap<string, BcPivotCell>
  valueDefinitions: readonly PivotValueDefinition<TRow>[]
}

export interface PivotDisplayRow {
  id: string
  keyPath: readonly unknown[]
  label: string
  level: number
  isTotal: boolean
  isSubtotal: boolean
  hasChildren: boolean
}

export type PivotDisplayColumn<TRow> = PivotAxisColumn | PivotValueColumn<TRow>

export interface PivotAxisColumn {
  kind: "axis"
  id: "__pivot-row-axis"
  left: number
  width: number
}

export interface PivotValueColumn<TRow> {
  kind: "value"
  id: string
  left: number
  width: number
  colKeyPath: readonly unknown[]
  valueIndex: number
  isTotal: boolean
  isSubtotal: boolean
  value: PivotValueDefinition<TRow>
}

export interface PivotValueDefinition<TRow> {
  columnId: ColumnId
  column: BcReactGridColumn<TRow>
  label: string
}

export interface PivotHeaderCell {
  id: string
  label: string
  left: number
  width: number
  colSpan: number
  isTotal: boolean
}

export interface BcGridPivotViewProps<TRow> {
  model: PivotViewModel<TRow>
  bodyHeight: number | undefined
  defaultRowHeight: number
  headerHeight: number
  locale?: string | undefined
  onVisibleRowRangeChange?: ((range: { startIndex: number; endIndex: number }) => void) | undefined
}

export function BcGridPivotView<TRow>({
  model,
  bodyHeight,
  defaultRowHeight,
  headerHeight,
  locale,
  onVisibleRowRangeChange,
}: BcGridPivotViewProps<TRow>): ReactNode {
  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 })
  const scrollOffsetRef = useRef(scrollOffset)
  const [, setRenderVersion] = useState(0)
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const requestRender = useCallback(() => {
    setRenderVersion((version) => (version + 1) % Number.MAX_SAFE_INTEGER)
  }, [])
  const updateScrollOffset = useCallback((next: { top: number; left: number }) => {
    scrollOffsetRef.current = next
    setScrollOffset(next)
  }, [])

  const virtualizer = useMemo(() => {
    const next = new Virtualizer({
      rowCount: model.rows.length,
      colCount: model.columns.length,
      defaultRowHeight,
      defaultColWidth: DEFAULT_COL_WIDTH,
      viewportHeight: bodyHeight ?? 360,
      viewportWidth: 800,
      pinnedLeftCols: model.columns.length > 0 ? 1 : 0,
    })

    model.columns.forEach((column, index) => next.setColWidth(index, column.width))
    next.setScrollTop(scrollOffsetRef.current.top)
    next.setScrollLeft(scrollOffsetRef.current.left)
    return next
  }, [bodyHeight, defaultRowHeight, model.columns, model.rows.length])

  const { viewport } = useViewportSync({
    scrollerRef,
    virtualizer,
    fallbackBodyHeight: bodyHeight ?? 360,
    requestRender,
  })

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

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget
      virtualizer.setScrollTop(target.scrollTop)
      virtualizer.setScrollLeft(target.scrollLeft)
      updateScrollOffset({ top: target.scrollTop, left: target.scrollLeft })
    },
    [updateScrollOffset, virtualizer],
  )

  const totalHeaderHeight = model.headerRowCount * headerHeight

  return (
    <>
      <div
        className="bc-grid-pivot-header-viewport"
        // biome-ignore lint/a11y/useSemanticElements: The virtualized grid uses ARIA grid roles on positioned divs.
        role="rowgroup"
        style={{ ...headerViewportStyle, height: totalHeaderHeight }}
      >
        <div
          className="bc-grid-pivot-header"
          style={{ height: totalHeaderHeight, minWidth: "100%", position: "relative" }}
        >
          {model.headerRows.map((headerRow, rowIndex) => (
            <div
              key={`pivot-header-${headerRow[0]?.id ?? "values"}`}
              className="bc-grid-pivot-header-row"
              // biome-ignore lint/a11y/useSemanticElements: This row is rendered inside the grid's ARIA tree.
              role="row"
              aria-rowindex={rowIndex + 1}
              tabIndex={-1}
              style={{
                ...headerRowStyle(model.totalWidth, headerHeight, scrollOffset.left),
                position: "absolute",
                top: rowIndex * headerHeight,
              }}
            >
              {rowIndex === 0 ? (
                <div
                  className="bc-grid-cell bc-grid-pivot-row-axis-header"
                  // biome-ignore lint/a11y/useSemanticElements: This positioned cell participates in the ARIA grid.
                  role="columnheader"
                  aria-colindex={1}
                  aria-rowspan={model.headerRowCount}
                  style={cellStyle({
                    align: "left",
                    height: totalHeaderHeight,
                    left: 0,
                    pinned: "left",
                    scrollLeft: scrollOffset.left,
                    totalWidth: model.totalWidth,
                    viewportWidth: viewport.width,
                    width: PIVOT_AXIS_WIDTH,
                    zIndex: 5,
                  })}
                >
                  Rows
                </div>
              ) : null}
              {headerRow.map((cell) => (
                <div
                  key={cell.id}
                  className={classNames(
                    "bc-grid-cell",
                    "bc-grid-pivot-col-cell",
                    cell.isTotal ? "bc-grid-pivot-total-cell" : undefined,
                  )}
                  // biome-ignore lint/a11y/useSemanticElements: This positioned cell participates in the ARIA grid.
                  role="columnheader"
                  aria-colindex={model.columns.findIndex((column) => column.left === cell.left) + 1}
                  aria-colspan={cell.colSpan}
                  data-bc-grid-pivot-total={cell.isTotal || undefined}
                  style={cellStyle({
                    align: "center",
                    height: headerHeight,
                    left: cell.left,
                    pinned: null,
                    scrollLeft: scrollOffset.left,
                    totalWidth: model.totalWidth,
                    viewportWidth: viewport.width,
                    width: cell.width,
                    zIndex: 2,
                  })}
                >
                  {cell.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="bc-grid-scroller bc-grid-pivot-scroller"
        // biome-ignore lint/a11y/useSemanticElements: The virtualized grid uses ARIA grid roles on positioned divs.
        role="rowgroup"
        onScroll={handleScroll}
        style={scrollerStyle(bodyHeight)}
      >
        <div
          className="bc-grid-canvas bc-grid-pivot-canvas"
          style={canvasStyle(virtualWindow.totalHeight, virtualWindow.totalWidth)}
        >
          {virtualWindow.rows.map((virtualRow) => {
            const row = model.rows[virtualRow.index]
            if (!row) return null
            return (
              <div
                key={row.id}
                className={classNames(
                  "bc-grid-row",
                  "bc-grid-pivot-row",
                  row.isTotal || row.isSubtotal ? "bc-grid-pivot-total-row" : undefined,
                )}
                // biome-ignore lint/a11y/useSemanticElements: This row is rendered inside the grid's ARIA tree.
                role="row"
                aria-rowindex={virtualRow.index + model.headerRowCount + 1}
                tabIndex={-1}
                data-bc-grid-pivot-total={row.isTotal || row.isSubtotal || undefined}
                style={rowStyle(virtualRow.top, virtualRow.height, virtualWindow.totalWidth)}
              >
                {virtualWindow.cols.map((virtualCol) => {
                  const column = model.columns[virtualCol.index]
                  if (!column) return null
                  if (column.kind === "axis") {
                    return (
                      <div
                        key={column.id}
                        className="bc-grid-cell bc-grid-pivot-row-axis"
                        // biome-ignore lint/a11y/useSemanticElements: This positioned cell participates in the ARIA grid.
                        role="rowheader"
                        aria-colindex={1}
                        aria-level={Math.max(1, row.level)}
                        aria-expanded={row.hasChildren ? true : undefined}
                        data-bc-grid-pivot-total={row.isTotal || row.isSubtotal || undefined}
                        style={{
                          ...cellStyle({
                            align: "left",
                            height: virtualRow.height,
                            left: virtualCol.left,
                            pinned: "left",
                            scrollLeft: scrollOffset.left,
                            totalWidth: virtualWindow.totalWidth,
                            viewportWidth: viewport.width,
                            width: virtualCol.width,
                            zIndex: 4,
                          }),
                          paddingLeft: `calc(var(--bc-grid-cell-padding-x, 12px) + ${Math.max(0, row.level - 1) * 1.25}rem)`,
                        }}
                      >
                        {row.label}
                      </div>
                    )
                  }

                  const cell = model.cellByKey.get(pivotCellKey(row.keyPath, column.colKeyPath))
                  const result = cell?.results[column.valueIndex]
                  const formatted = result
                    ? formatAggregationResult(result, column.value.column, locale)
                    : ""
                  return (
                    <div
                      key={column.id}
                      className={classNames(
                        "bc-grid-cell",
                        "bc-grid-cell-right",
                        "bc-grid-pivot-value-cell",
                        row.isTotal || row.isSubtotal || column.isTotal || column.isSubtotal
                          ? "bc-grid-pivot-total-cell"
                          : undefined,
                      )}
                      // biome-ignore lint/a11y/useSemanticElements: This positioned cell participates in the ARIA grid.
                      role="gridcell"
                      aria-colindex={virtualCol.index + 1}
                      aria-readonly="true"
                      tabIndex={-1}
                      data-bc-grid-pivot-total={
                        row.isTotal ||
                        row.isSubtotal ||
                        column.isTotal ||
                        column.isSubtotal ||
                        undefined
                      }
                      style={cellStyle({
                        align: "right",
                        height: virtualRow.height,
                        left: virtualCol.left,
                        pinned: null,
                        scrollLeft: scrollOffset.left,
                        totalWidth: virtualWindow.totalWidth,
                        viewportWidth: viewport.width,
                        width: virtualCol.width,
                      })}
                    >
                      {formatted}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

export function buildPivotViewModel<TRow>({
  columns,
  locale,
  pivoted,
  state,
}: {
  columns: readonly BcReactGridColumn<TRow>[]
  locale?: string | undefined
  pivoted: BcPivotedData<TRow>
  state: BcPivotState
}): PivotViewModel<TRow> {
  const valueDefinitions = resolvePivotValueDefinitions(columns, state)
  const rows = buildPivotDisplayRows(pivoted, state, locale)
  const colPaths = buildPivotColumnPaths(pivoted, state, locale)
  const valueColumns = buildPivotValueColumns(colPaths, valueDefinitions, state)
  const modelColumns: PivotDisplayColumn<TRow>[] = [
    { id: "__pivot-row-axis", kind: "axis", left: 0, width: PIVOT_AXIS_WIDTH },
    ...valueColumns,
  ]
  const headerRows = buildPivotHeaderRows(valueColumns, state, locale)
  const lastColumn = modelColumns[modelColumns.length - 1]
  const totalWidth = lastColumn ? lastColumn.left + lastColumn.width : PIVOT_AXIS_WIDTH

  return {
    cellByKey: new Map(
      pivoted.cells.map((cell) => [pivotCellKey(cell.rowKeyPath, cell.colKeyPath), cell]),
    ),
    columns: modelColumns,
    headerRows,
    headerRowCount: headerRows.length,
    rows,
    totalWidth: Math.max(PIVOT_AXIS_WIDTH, totalWidth),
    valueDefinitions,
  }
}

export function pivotCellKey(
  rowKeyPath: readonly unknown[],
  colKeyPath: readonly unknown[],
): string {
  return `${JSON.stringify(rowKeyPath)}|${JSON.stringify(colKeyPath)}`
}

function resolvePivotValueDefinitions<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  state: BcPivotState,
): readonly PivotValueDefinition<TRow>[] {
  const columnsById = new Map(columns.map((column, index) => [columnIdFor(column, index), column]))
  return state.values.flatMap((value) => {
    const column = columnsById.get(value.columnId)
    if (!column) return []
    return [
      {
        column,
        columnId: value.columnId,
        label:
          value.label ?? defaultPivotValueLabel(column, value.columnId, value.aggregation?.type),
      },
    ]
  })
}

function defaultPivotValueLabel<TRow>(
  column: BcReactGridColumn<TRow>,
  columnId: ColumnId,
  aggregationType: string | undefined,
): string {
  const header = typeof column.header === "string" ? column.header : columnId
  const type = aggregationType ?? column.aggregation?.type
  return type ? `${header} (${type})` : header
}

function buildPivotDisplayRows<TRow>(
  pivoted: BcPivotedData<TRow>,
  state: BcPivotState,
  locale: string | undefined,
): readonly PivotDisplayRow[] {
  if (state.rowGroups.length === 0) {
    return [pivotRow([], "Total", 1, true, false, false)]
  }

  const includeTotals = state.subtotals?.rows ?? true
  const rows: PivotDisplayRow[] = []
  const visit = (node: BcPivotedData<TRow>["rowRoot"]) => {
    const hasChildren = node.children.length > 0
    if (hasChildren && includeTotals) {
      rows.push(
        pivotRow(
          node.keyPath,
          `${formatPivotKey(node.value, locale)} Total`,
          Math.max(1, node.level),
          false,
          true,
          true,
        ),
      )
    }
    if (hasChildren) {
      for (const child of node.children) visit(child)
      return
    }
    rows.push(
      pivotRow(
        node.keyPath,
        formatPivotKey(node.value, locale),
        Math.max(1, node.level),
        false,
        false,
        false,
      ),
    )
  }

  for (const child of pivoted.rowRoot.children) visit(child)
  if (includeTotals) rows.push(pivotRow([], "Grand Total", 1, true, false, false))
  return rows
}

interface PivotColumnPath {
  keyPath: readonly unknown[]
  label: string
  isTotal: boolean
  isSubtotal: boolean
}

function buildPivotColumnPaths<TRow>(
  pivoted: BcPivotedData<TRow>,
  state: BcPivotState,
  locale: string | undefined,
): readonly PivotColumnPath[] {
  if (state.colGroups.length === 0) {
    return [{ isSubtotal: false, isTotal: true, keyPath: [], label: "Total" }]
  }

  const includeTotals = state.subtotals?.cols ?? true
  const paths: PivotColumnPath[] = []
  const visit = (node: BcPivotedData<TRow>["colRoot"]) => {
    const hasChildren = node.children.length > 0
    if (hasChildren) {
      for (const child of node.children) visit(child)
      if (includeTotals) {
        paths.push({
          isSubtotal: true,
          isTotal: false,
          keyPath: node.keyPath,
          label: `${formatPivotKey(node.value, locale)} Total`,
        })
      }
      return
    }
    paths.push({
      isSubtotal: false,
      isTotal: false,
      keyPath: node.keyPath,
      label: formatPivotKey(node.value, locale),
    })
  }

  for (const child of pivoted.colRoot.children) visit(child)
  if (includeTotals)
    paths.push({ isSubtotal: false, isTotal: true, keyPath: [], label: "Grand Total" })
  return paths
}

function buildPivotValueColumns<TRow>(
  colPaths: readonly PivotColumnPath[],
  values: readonly PivotValueDefinition<TRow>[],
  state: BcPivotState,
): readonly PivotValueColumn<TRow>[] {
  const columns: PivotValueColumn<TRow>[] = []
  let left = PIVOT_AXIS_WIDTH
  const effectiveValues = values.length > 0 ? values : []
  for (const colPath of colPaths) {
    for (let valueIndex = 0; valueIndex < effectiveValues.length; valueIndex += 1) {
      const value = effectiveValues[valueIndex]
      if (!value) continue
      columns.push({
        colKeyPath: colPath.keyPath,
        id: `pivot-${pivotPathId(colPath.keyPath)}-${value.columnId}-${valueIndex}`,
        isSubtotal: colPath.isSubtotal,
        isTotal: colPath.isTotal || (state.colGroups.length === 0 && colPath.keyPath.length === 0),
        kind: "value",
        left,
        value,
        valueIndex,
        width: PIVOT_VALUE_WIDTH,
      })
      left += PIVOT_VALUE_WIDTH
    }
  }
  return columns
}

function buildPivotHeaderRows<TRow>(
  columns: readonly PivotValueColumn<TRow>[],
  state: BcPivotState,
  locale: string | undefined,
): readonly (readonly PivotHeaderCell[])[] {
  if (columns.length === 0) return [[]]

  const rows: Array<readonly PivotHeaderCell[]> = []
  for (let level = 0; level < state.colGroups.length; level += 1) {
    rows.push(groupHeaderCells(columns, level, locale))
  }

  rows.push(
    columns.map((column) => ({
      colSpan: 1,
      id: `value-${column.id}`,
      isTotal: column.isTotal || column.isSubtotal,
      label: column.value.label,
      left: column.left,
      width: column.width,
    })),
  )
  return rows
}

function groupHeaderCells<TRow>(
  columns: readonly PivotValueColumn<TRow>[],
  level: number,
  locale: string | undefined,
): readonly PivotHeaderCell[] {
  const cells: PivotHeaderCell[] = []
  let currentKey: string | null = null
  let current: PivotHeaderCell | null = null

  for (const column of columns) {
    const key = pivotHeaderGroupKey(column, level)
    const label = pivotHeaderGroupLabel(column, level, locale)
    if (current && currentKey === key) {
      current.width += column.width
      current.colSpan += 1
      continue
    }
    current = {
      colSpan: 1,
      id: `group-${level}-${key}`,
      isTotal: column.isTotal || column.isSubtotal,
      label,
      left: column.left,
      width: column.width,
    }
    currentKey = key
    cells.push(current)
  }

  return cells
}

function pivotHeaderGroupKey<TRow>(column: PivotValueColumn<TRow>, level: number): string {
  if (column.colKeyPath.length === 0) return "__grand_total__"
  if (level < column.colKeyPath.length) {
    return JSON.stringify(column.colKeyPath.slice(0, level + 1))
  }
  return `${JSON.stringify(column.colKeyPath)}__subtotal__`
}

function pivotHeaderGroupLabel<TRow>(
  column: PivotValueColumn<TRow>,
  level: number,
  locale: string | undefined,
): string {
  if (column.colKeyPath.length === 0) return "Grand Total"
  if (level < column.colKeyPath.length) return formatPivotKey(column.colKeyPath[level], locale)
  return `${formatPivotKey(column.colKeyPath[column.colKeyPath.length - 1], locale)} Total`
}

function pivotRow(
  keyPath: readonly unknown[],
  label: string,
  level: number,
  isTotal: boolean,
  isSubtotal: boolean,
  hasChildren: boolean,
): PivotDisplayRow {
  return {
    hasChildren,
    id: `pivot-row-${pivotPathId(keyPath)}`,
    isSubtotal,
    isTotal,
    keyPath,
    label,
    level,
  }
}

function formatPivotKey(value: unknown, locale: string | undefined): string {
  if (value == null) return "Blank"
  if (value instanceof Date) return new Intl.DateTimeFormat(locale).format(value)
  return String(value)
}

function pivotPathId(path: readonly unknown[]): string {
  if (path.length === 0) return "total"
  return path.map((value) => encodeURIComponent(String(value))).join("__")
}
