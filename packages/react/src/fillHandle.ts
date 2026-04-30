import type { BcRange, RowId } from "@bc-grid/core"
import type { CSSProperties } from "react"
import { type ResolvedColumn, pinnedTransformValue } from "./gridInternals"

export interface RangeIndexBounds {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

export interface FillHandleVirtualRow {
  index: number
  top: number
  height: number
}

export interface FillHandleVirtualCol {
  index: number
  left: number
  width: number
  pinned: "left" | "right" | null
}

export interface ActiveRangeFillHandleLayout {
  rowIndex: number
  colIndex: number
  style: CSSProperties
}

export function resolveRangeIndexBounds<TRow>(
  range: BcRange,
  columns: readonly ResolvedColumn<TRow>[],
  rowIds: readonly RowId[],
): RangeIndexBounds | undefined {
  const startRow = rowIds.indexOf(range.start.rowId)
  const endRow = rowIds.indexOf(range.end.rowId)
  const startCol = columns.findIndex((column) => column.columnId === range.start.columnId)
  const endCol = columns.findIndex((column) => column.columnId === range.end.columnId)
  if (startRow < 0 || endRow < 0 || startCol < 0 || endCol < 0) return undefined

  return {
    rowStart: Math.min(startRow, endRow),
    rowEnd: Math.max(startRow, endRow),
    colStart: Math.min(startCol, endCol),
    colEnd: Math.max(startCol, endCol),
  }
}

export function resolveActiveRangeFillHandle<TRow>({
  range,
  columns,
  rowIds,
  virtualRows,
  virtualCols,
  scrollLeft,
  totalWidth,
  viewportWidth,
}: {
  range: BcRange | undefined
  columns: readonly ResolvedColumn<TRow>[]
  rowIds: readonly RowId[]
  virtualRows: readonly FillHandleVirtualRow[]
  virtualCols: readonly FillHandleVirtualCol[]
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
}): ActiveRangeFillHandleLayout | undefined {
  if (!range) return undefined
  const bounds = resolveRangeIndexBounds(range, columns, rowIds)
  if (!bounds) return undefined

  const row = virtualRows.find((candidate) => candidate.index === bounds.rowEnd)
  const col = virtualCols.find((candidate) => candidate.index === bounds.colEnd)
  if (!row || !col) return undefined

  const pinnedTransform = pinnedTransformValue(col.pinned, scrollLeft, totalWidth, viewportWidth)
  return {
    rowIndex: row.index,
    colIndex: col.index,
    style: {
      left: col.left + col.width,
      top: row.top + row.height,
      transform: `${pinnedTransform ? `${pinnedTransform} ` : ""}translate3d(-50%, -50%, 0)`,
    },
  }
}
