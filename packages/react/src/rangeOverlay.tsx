import { normaliseRange } from "@bc-grid/core"
import type { BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import type { Virtualizer } from "@bc-grid/virtualizer"
import type { CSSProperties } from "react"
import { classNames, pinnedClassName, pinnedTransformValue } from "./gridInternals"

export interface RangeOverlayColumn {
  readonly columnId: ColumnId
  readonly pinned: "left" | "right" | null
}

type RangeOverlayVirtualizer = Pick<
  Virtualizer,
  "rowOffset" | "rowHeight" | "colOffset" | "colWidth"
>

export interface RangeOverlayRect {
  key: string
  top: number
  left: number
  width: number
  height: number
  pinned: "left" | "right" | null
  transform: string | undefined
}

export interface ComputeRangeOverlayRectsInput {
  columns: readonly RangeOverlayColumn[]
  rangeSelection: BcRangeSelection
  rowIds: readonly RowId[]
  scrollLeft: number
  totalWidth: number
  viewportWidth: number
  virtualizer: RangeOverlayVirtualizer
}

interface ColumnSegment {
  start: number
  end: number
  pinned: "left" | "right" | null
}

export function computeRangeOverlayRects({
  columns,
  rangeSelection,
  rowIds,
  scrollLeft,
  totalWidth,
  viewportWidth,
  virtualizer,
}: ComputeRangeOverlayRectsInput): RangeOverlayRect[] {
  const activeRange = rangeSelection.ranges[rangeSelection.ranges.length - 1]
  if (!activeRange) return []

  const range = normaliseRange(activeRange, columns, rowIds)
  if (!range) return []

  const top = virtualizer.rowOffset(range.rowStart)
  const bottom = virtualizer.rowOffset(range.rowEnd) + virtualizer.rowHeight(range.rowEnd)
  const height = bottom - top
  if (height <= 0) return []

  return splitColumnSegments(columns, range.colStart, range.colEnd)
    .map((segment, index): RangeOverlayRect | null => {
      const left = virtualizer.colOffset(segment.start)
      const right = virtualizer.colOffset(segment.end) + virtualizer.colWidth(segment.end)
      const width = right - left
      if (width <= 0) return null

      return {
        key: `${range.topLeft.rowId}:${range.topLeft.columnId}-${range.bottomRight.rowId}:${range.bottomRight.columnId}-${index}`,
        top,
        left,
        width,
        height,
        pinned: segment.pinned,
        transform: pinnedTransformValue(segment.pinned, scrollLeft, totalWidth, viewportWidth),
      }
    })
    .filter((rect): rect is RangeOverlayRect => rect !== null)
}

export function rangeOverlayRectStyle(rect: RangeOverlayRect): CSSProperties {
  return {
    height: rect.height,
    left: rect.left,
    position: "absolute",
    top: rect.top,
    transform: rect.transform,
    width: rect.width,
  }
}

export function BcRangeOverlay(props: ComputeRangeOverlayRectsInput) {
  const rects = computeRangeOverlayRects(props)
  if (rects.length === 0) return null
  const bodyRects = rects.filter((rect) => rect.pinned === null)
  const pinnedRects = rects.filter((rect) => rect.pinned !== null)

  return (
    <>
      {bodyRects.length > 0 ? <RangeOverlayLayer rects={bodyRects} variant="body" /> : null}
      {pinnedRects.length > 0 ? <RangeOverlayLayer rects={pinnedRects} variant="pinned" /> : null}
    </>
  )
}

function RangeOverlayLayer({
  rects,
  variant,
}: {
  rects: readonly RangeOverlayRect[]
  variant: "body" | "pinned"
}) {
  return (
    <div
      aria-hidden="true"
      className={classNames(
        "bc-grid-range-overlay-layer",
        `bc-grid-range-overlay-layer-${variant}`,
      )}
      data-bc-grid-range-overlay-layer={variant}
    >
      {rects.map((rect) => (
        <div
          key={rect.key}
          className={classNames("bc-grid-range-overlay", pinnedClassName(rect.pinned))}
          data-bc-grid-range-active="true"
          data-bc-grid-range-overlay="true"
          data-bc-grid-range-pinned={rect.pinned ?? undefined}
          style={rangeOverlayRectStyle(rect)}
        />
      ))}
    </div>
  )
}

function splitColumnSegments(
  columns: readonly RangeOverlayColumn[],
  start: number,
  end: number,
): ColumnSegment[] {
  const first = columns[start]
  if (!first) return []

  const segments: ColumnSegment[] = []
  let segmentStart = start
  let pinned = first.pinned

  for (let index = start + 1; index <= end; index += 1) {
    const nextPinned = columns[index]?.pinned ?? null
    if (nextPinned === pinned) continue
    segments.push({ start: segmentStart, end: index - 1, pinned })
    segmentStart = index
    pinned = nextPinned
  }

  segments.push({ start: segmentStart, end, pinned })
  return segments
}
