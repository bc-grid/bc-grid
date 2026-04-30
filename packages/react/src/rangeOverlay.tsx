import type { BcRange, BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import type { CSSProperties, ReactNode } from "react"
import { type ResolvedColumn, pinnedTransformValue } from "./gridInternals"

export interface RangeOverlayRect {
  key: string
  rangeIndex: number
  active: boolean
  pinned: "left" | "right" | null
  top: number
  left: number
  width: number
  height: number
}

interface RangeOverlayGeometry {
  colCount: number
  pinnedLeftCols: number
  pinnedRightCols: number
  colOffset(index: number): number
  colWidth(index: number): number
  rowOffset(index: number): number
  rowHeight(index: number): number
}

interface BuildRangeOverlayRectsParams {
  selection: BcRangeSelection
  columns: readonly { columnId: ColumnId }[]
  rowIds: readonly RowId[]
  geometry: RangeOverlayGeometry
}

interface BcGridRangeOverlayProps<TRow> {
  columns: readonly ResolvedColumn<TRow>[]
  rowIds: readonly RowId[]
  selection: BcRangeSelection
  colCount: number
  pinnedLeftCols: number
  pinnedRightCols: number
  scrollLeft: number
  totalHeight: number
  totalWidth: number
  viewportWidth: number
  colOffset(index: number): number
  colWidth(index: number): number
  rowOffset(index: number): number
  rowHeight(index: number): number
}

export function buildRangeOverlayRects({
  selection,
  columns,
  rowIds,
  geometry,
}: BuildRangeOverlayRectsParams): RangeOverlayRect[] {
  const rects: RangeOverlayRect[] = []
  selection.ranges.forEach((range, rangeIndex) => {
    const indexes = resolveRangeIndexes(range, columns, rowIds)
    if (!indexes) return

    const rowStart = Math.min(indexes.startRow, indexes.endRow)
    const rowEnd = Math.max(indexes.startRow, indexes.endRow)
    const colStart = Math.min(indexes.startCol, indexes.endCol)
    const colEnd = Math.max(indexes.startCol, indexes.endCol)
    const top = geometry.rowOffset(rowStart)
    const bottom = geometry.rowOffset(rowEnd) + geometry.rowHeight(rowEnd)
    const active = rangeIndex === selection.ranges.length - 1

    for (const segment of splitColumnSegments(
      colStart,
      colEnd,
      geometry.colCount,
      geometry.pinnedLeftCols,
      geometry.pinnedRightCols,
    )) {
      const left = geometry.colOffset(segment.start)
      const right = geometry.colOffset(segment.end) + geometry.colWidth(segment.end)
      rects.push({
        key: `${rangeIndex}-${segment.pinned ?? "body"}-${segment.start}-${segment.end}`,
        rangeIndex,
        active,
        pinned: segment.pinned,
        top,
        left,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      })
    }
  })
  return rects
}

export function BcGridRangeOverlay<TRow>({
  columns,
  rowIds,
  selection,
  colCount,
  pinnedLeftCols,
  pinnedRightCols,
  scrollLeft,
  totalHeight,
  totalWidth,
  viewportWidth,
  colOffset,
  colWidth,
  rowOffset,
  rowHeight,
}: BcGridRangeOverlayProps<TRow>): ReactNode {
  const rects = buildRangeOverlayRects({
    selection,
    columns,
    rowIds,
    geometry: {
      colCount,
      pinnedLeftCols,
      pinnedRightCols,
      colOffset,
      colWidth,
      rowOffset,
      rowHeight,
    },
  })
  if (rects.length === 0) return null

  return (
    <div
      aria-hidden="true"
      className="bc-grid-range-overlay"
      role="presentation"
      style={{
        height: Math.max(totalHeight, 1),
        width: Math.max(totalWidth, 1),
      }}
    >
      {rects.map((rect) => (
        <div
          key={rect.key}
          className="bc-grid-range-rect"
          data-active={rect.active ? "true" : undefined}
          data-pinned={rect.pinned ?? undefined}
          data-range-index={rect.rangeIndex}
          style={rangeRectStyle(rect, scrollLeft, totalWidth, viewportWidth)}
        />
      ))}
    </div>
  )
}

function rangeRectStyle(
  rect: RangeOverlayRect,
  scrollLeft: number,
  totalWidth: number,
  viewportWidth: number,
): CSSProperties {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    transform: pinnedTransformValue(rect.pinned, scrollLeft, totalWidth, viewportWidth),
    width: rect.width,
    zIndex: rect.pinned ? 4 : 2,
  }
}

function resolveRangeIndexes(
  range: BcRange,
  columns: readonly { columnId: ColumnId }[],
  rowIds: readonly RowId[],
):
  | {
      startRow: number
      endRow: number
      startCol: number
      endCol: number
    }
  | undefined {
  const startRow = rowIds.indexOf(range.start.rowId)
  const endRow = rowIds.indexOf(range.end.rowId)
  const startCol = columns.findIndex((column) => column.columnId === range.start.columnId)
  const endCol = columns.findIndex((column) => column.columnId === range.end.columnId)
  if (startRow < 0 || endRow < 0 || startCol < 0 || endCol < 0) return undefined
  return { startRow, endRow, startCol, endCol }
}

function splitColumnSegments(
  colStart: number,
  colEnd: number,
  colCount: number,
  pinnedLeftCols: number,
  pinnedRightCols: number,
): Array<{ start: number; end: number; pinned: "left" | "right" | null }> {
  const segments: Array<{ start: number; end: number; pinned: "left" | "right" | null }> = []
  const bodyStart = pinnedLeftCols
  const bodyEnd = Math.max(bodyStart, colCount - pinnedRightCols) - 1

  addSegment(segments, colStart, colEnd, 0, pinnedLeftCols - 1, "left")
  addSegment(segments, colStart, colEnd, bodyStart, bodyEnd, null)
  addSegment(segments, colStart, colEnd, colCount - pinnedRightCols, colCount - 1, "right")

  return segments
}

function addSegment(
  segments: Array<{ start: number; end: number; pinned: "left" | "right" | null }>,
  colStart: number,
  colEnd: number,
  segmentStart: number,
  segmentEnd: number,
  pinned: "left" | "right" | null,
): void {
  if (segmentStart > segmentEnd) return
  const start = Math.max(colStart, segmentStart)
  const end = Math.min(colEnd, segmentEnd)
  if (start > end) return
  segments.push({ start, end, pinned })
}
