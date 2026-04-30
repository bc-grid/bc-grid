import type { BcCellPosition, ColumnId, RowId } from "@bc-grid/core"
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
import { BcGridTooltip } from "./tooltip"
import type { BcCellRendererParams } from "./types"
import { formatCellValue, getCellValue } from "./value"

interface SearchTextPart {
  match: boolean
  text: string
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
  /**
   * Overlay-aware lookup from the editing controller. When the cell has
   * been edited locally (committed via the editor framework) the overlay
   * holds the new value; the renderer prefers it over the raw row[field]
   * read so the grid reflects the commit immediately even before the
   * consumer mirrors it into their own data prop.
   */
  hasOverlayValue?: (rowId: RowId, columnId: ColumnId) => boolean
  getOverlayValue?: (rowId: RowId, columnId: ColumnId) => unknown
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
  hasOverlayValue,
  getOverlayValue,
}: RenderBodyCellParams<TRow>): ReactNode {
  if (!column) return null

  const overlayApplies = hasOverlayValue?.(entry.rowId, column.columnId) ?? false
  const value = overlayApplies
    ? getOverlayValue?.(entry.rowId, column.columnId)
    : getCellValue(entry.row, column.source)
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
  const cellId = cellDomId(domBaseId, entry.rowId, column.columnId)
  const tooltip =
    typeof column.source.tooltip === "function"
      ? column.source.tooltip(entry.row)
      : column.source.tooltip

  return (
    <BcGridTooltip key={column.columnId} content={tooltip} id={`${cellId}-tooltip`}>
      <div
        id={cellId}
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
        aria-labelledby={`${headerDomId(domBaseId, column.columnId)} ${cellId}`}
        aria-selected={selected || undefined}
        data-bc-grid-active-cell={active || undefined}
        data-column-id={column.columnId}
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
        {column.source.cellRenderer
          ? column.source.cellRenderer(params)
          : highlightSearchText(formattedValue, searchText)}
      </div>
    </BcGridTooltip>
  )
}

export function splitSearchText(value: string, searchText: string): SearchTextPart[] {
  const needle = searchText.trim()
  if (!needle) return [{ match: false, text: value }]

  const haystack = value.toLowerCase()
  const query = needle.toLowerCase()
  const parts: SearchTextPart[] = []
  let start = 0

  while (start < value.length) {
    const matchIndex = haystack.indexOf(query, start)
    if (matchIndex === -1) break
    if (matchIndex > start) {
      parts.push({ match: false, text: value.slice(start, matchIndex) })
    }
    const end = matchIndex + query.length
    parts.push({ match: true, text: value.slice(matchIndex, end) })
    start = end
  }

  if (start < value.length) parts.push({ match: false, text: value.slice(start) })
  return parts.length > 0 ? parts : [{ match: false, text: value }]
}

export function highlightSearchText(value: string, searchText: string): ReactNode {
  return splitSearchText(value, searchText).map((part, index) =>
    part.match ? (
      <mark data-bc-grid-search-match="true" key={`${part.text}-${index}`}>
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  )
}
