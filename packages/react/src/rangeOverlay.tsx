import type { BcRange, BcRangeSelection, RowId } from "@bc-grid/core"
import type { CSSProperties, ReactNode } from "react"
import { type ResolvedColumn, pinnedTransformValue } from "./gridInternals"

export interface RangeOverlayRect {
  key: string
  pinned: "left" | "right" | null
  top: number
  left: number
  width: number
  height: number
}

export interface RangeOverlayVirtualRow {
  index: number
  top: number
  height: number
}

export interface RangeOverlayVirtualCol {
  index: number
  left: number
  width: number
  pinned: "left" | "right" | null
}

interface RangeOverlaySegment {
  start: number
  end: number
  pinned: "left" | "right" | null
}

interface BuildActiveRangeOverlayRectsParams<TRow> {
  selection: BcRangeSelection
  columns: readonly ResolvedColumn<TRow>[]
  rowIds: readonly RowId[]
  virtualRows: readonly RangeOverlayVirtualRow[]
  virtualCols: readonly RangeOverlayVirtualCol[]
}

interface BcGridRangeOverlayProps<TRow> extends BuildActiveRangeOverlayRectsParams<TRow> {
  scrollLeft: number
  totalHeight: number
  totalWidth: number
  viewportWidth: number
}

export function buildActiveRangeOverlayRects<TRow>({
  selection,
  columns,
  rowIds,
  virtualRows,
  virtualCols,
}: BuildActiveRangeOverlayRectsParams<TRow>): RangeOverlayRect[] {
  const range = selection.ranges[selection.ranges.length - 1]
  const bounds = range ? resolveRangeIndexBounds(range, columns, rowIds) : undefined
  if (!bounds) return []

  const rowSegments = contiguousSegments(
    virtualRows.filter((row) => row.index >= bounds.rowStart && row.index <= bounds.rowEnd),
  )
  const colSegments = contiguousSegments(
    virtualCols.filter((col) => col.index >= bounds.colStart && col.index <= bounds.colEnd),
  )

  const rects: RangeOverlayRect[] = []
  for (const rowSegment of rowSegments) {
    const firstRow = virtualRows.find((row) => row.index === rowSegment.start)
    const lastRow = virtualRows.find((row) => row.index === rowSegment.end)
    if (!firstRow || !lastRow) continue

    for (const colSegment of colSegments) {
      const firstCol = virtualCols.find((col) => col.index === colSegment.start)
      const lastCol = virtualCols.find((col) => col.index === colSegment.end)
      if (!firstCol || !lastCol) continue

      rects.push({
        key: `${rowSegment.start}-${rowSegment.end}-${firstCol.pinned ?? "body"}-${
          colSegment.start
        }-${colSegment.end}`,
        pinned: firstCol.pinned,
        top: firstRow.top,
        left: firstCol.left,
        width: Math.max(0, lastCol.left + lastCol.width - firstCol.left),
        height: Math.max(0, lastRow.top + lastRow.height - firstRow.top),
      })
    }
  }
  return rects
}

export function BcGridRangeOverlay<TRow>({
  selection,
  columns,
  rowIds,
  virtualRows,
  virtualCols,
  scrollLeft,
  totalHeight,
  totalWidth,
  viewportWidth,
}: BcGridRangeOverlayProps<TRow>): ReactNode {
  const rects = buildActiveRangeOverlayRects({
    selection,
    columns,
    rowIds,
    virtualRows,
    virtualCols,
  })
  if (rects.length === 0) return null

  return (
    <div
      aria-hidden="true"
      className="bc-grid-range-overlay"
      role="presentation"
      style={{ height: Math.max(totalHeight, 1), width: Math.max(totalWidth, 1) }}
    >
      {rects.map((rect) => (
        <div
          key={rect.key}
          className="bc-grid-range-rect"
          data-pinned={rect.pinned ?? undefined}
          style={rangeOverlayRectStyle(rect, scrollLeft, totalWidth, viewportWidth)}
        />
      ))}
    </div>
  )
}

export function rangeOverlayRectStyle(
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
  }
}

function resolveRangeIndexBounds<TRow>(
  range: BcRange,
  columns: readonly ResolvedColumn<TRow>[],
  rowIds: readonly RowId[],
):
  | {
      rowStart: number
      rowEnd: number
      colStart: number
      colEnd: number
    }
  | undefined {
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

function contiguousSegments(
  items: readonly { index: number; pinned?: "left" | "right" | null }[],
): RangeOverlaySegment[] {
  const segments: RangeOverlaySegment[] = []
  for (const item of [...items].sort((a, b) => a.index - b.index)) {
    const last = segments[segments.length - 1]
    const pinned = item.pinned ?? null
    if (!last || item.index !== last.end + 1 || last.pinned !== pinned) {
      segments.push({ start: item.index, end: item.index, pinned })
      continue
    }
    last.end = item.index
  }
  return segments
}
