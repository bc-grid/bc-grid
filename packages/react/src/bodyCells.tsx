import type { BcCellPosition } from "@bc-grid/core"
import type { ReactNode } from "react"
import {
  type ResolvedColumn,
  type RowEntry,
  cellDomId,
  cellStyle,
  classNames,
  headerDomId,
  pinnedClassName,
} from "./gridInternals"
import type { BcCellRendererParams } from "./types"
import { formatCellValue, getCellValue } from "./value"

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

export function renderBodyCell<TRow>({
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
}: RenderBodyCellParams<TRow>): ReactNode {
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
        pinnedClassName(virtualCol.pinned),
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
