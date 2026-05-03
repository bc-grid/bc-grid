import { normaliseRange } from "@bc-grid/core"
import type { BcCellPosition, BcNormalisedRange, BcRange, ColumnId, RowId } from "@bc-grid/core"
import { cellsToTsv } from "./rangeClipboard"

type RangeFillColumnRef = { readonly columnId: ColumnId }

export type RangeFillDirection = "up" | "down" | "left" | "right"

export interface RangeFillProjection {
  direction: RangeFillDirection
  sourceRange: BcRange
  targetRange: BcRange
  fillRange: BcRange
  sourceBounds: BcNormalisedRange
  fillBounds: BcNormalisedRange
  targetBounds: BcNormalisedRange
}

export interface ProjectRangeFillInput {
  sourceRange: BcRange
  target: BcCellPosition
  columns: readonly RangeFillColumnRef[]
  rowIds: readonly RowId[]
}

export interface BuildLiteralRangeFillTsvInput {
  projection: RangeFillProjection
  columns: readonly RangeFillColumnRef[]
  rowIds: readonly RowId[]
  getSourceValue: (position: BcCellPosition) => unknown
}

export function projectRangeFill({
  sourceRange,
  target,
  columns,
  rowIds,
}: ProjectRangeFillInput): RangeFillProjection | null {
  const sourceBounds = normaliseRange(sourceRange, columns, rowIds)
  if (!sourceBounds) return null

  const targetRowIndex = rowIds.indexOf(target.rowId)
  const targetColumnIndex = columns.findIndex((column) => column.columnId === target.columnId)
  if (targetRowIndex < 0 || targetColumnIndex < 0) return null

  const direction = dominantFillDirection(sourceBounds, targetRowIndex, targetColumnIndex)
  if (!direction) return null

  const ranges = fillRangesForDirection(
    sourceBounds,
    direction,
    targetRowIndex,
    targetColumnIndex,
    columns,
    rowIds,
  )
  if (!ranges) return null

  const targetBounds = normaliseRange(ranges.targetRange, columns, rowIds)
  const fillBounds = normaliseRange(ranges.fillRange, columns, rowIds)
  if (!targetBounds || !fillBounds) return null

  return {
    direction,
    sourceRange,
    sourceBounds,
    targetRange: ranges.targetRange,
    targetBounds,
    fillRange: ranges.fillRange,
    fillBounds,
  }
}

export function buildLiteralRangeFillTsv({
  projection,
  columns,
  rowIds,
  getSourceValue,
}: BuildLiteralRangeFillTsvInput): string {
  const rows: string[][] = []
  const { fillBounds, sourceBounds } = projection

  for (let rowIndex = fillBounds.rowStart; rowIndex <= fillBounds.rowEnd; rowIndex += 1) {
    const row: string[] = []
    for (let colIndex = fillBounds.colStart; colIndex <= fillBounds.colEnd; colIndex += 1) {
      const sourceRowIndex =
        sourceBounds.rowStart + ((rowIndex - fillBounds.rowStart) % sourceBounds.rowSpan)
      const sourceColIndex =
        sourceBounds.colStart + ((colIndex - fillBounds.colStart) % sourceBounds.colSpan)
      const sourcePosition = positionAt(sourceRowIndex, sourceColIndex, columns, rowIds)
      row.push(sourcePosition ? stringifyFillValue(getSourceValue(sourcePosition)) : "")
    }
    rows.push(row)
  }

  return cellsToTsv(rows)
}

function dominantFillDirection(
  source: BcNormalisedRange,
  targetRowIndex: number,
  targetColumnIndex: number,
): RangeFillDirection | null {
  const verticalDistance =
    targetRowIndex < source.rowStart
      ? source.rowStart - targetRowIndex
      : targetRowIndex > source.rowEnd
        ? targetRowIndex - source.rowEnd
        : 0
  const horizontalDistance =
    targetColumnIndex < source.colStart
      ? source.colStart - targetColumnIndex
      : targetColumnIndex > source.colEnd
        ? targetColumnIndex - source.colEnd
        : 0

  if (verticalDistance === 0 && horizontalDistance === 0) return null
  if (verticalDistance >= horizontalDistance && verticalDistance > 0) {
    return targetRowIndex < source.rowStart ? "up" : "down"
  }
  if (horizontalDistance > 0) return targetColumnIndex < source.colStart ? "left" : "right"
  return null
}

function fillRangesForDirection(
  source: BcNormalisedRange,
  direction: RangeFillDirection,
  targetRowIndex: number,
  targetColumnIndex: number,
  columns: readonly RangeFillColumnRef[],
  rowIds: readonly RowId[],
): { targetRange: BcRange; fillRange: BcRange } | null {
  if (direction === "down") {
    if (targetRowIndex <= source.rowEnd) return null
    return {
      targetRange: rangeFromBounds(
        source.rowStart,
        source.colStart,
        targetRowIndex,
        source.colEnd,
        columns,
        rowIds,
      ),
      fillRange: rangeFromBounds(
        source.rowEnd + 1,
        source.colStart,
        targetRowIndex,
        source.colEnd,
        columns,
        rowIds,
      ),
    }
  }
  if (direction === "up") {
    if (targetRowIndex >= source.rowStart) return null
    return {
      targetRange: rangeFromBounds(
        targetRowIndex,
        source.colStart,
        source.rowEnd,
        source.colEnd,
        columns,
        rowIds,
      ),
      fillRange: rangeFromBounds(
        targetRowIndex,
        source.colStart,
        source.rowStart - 1,
        source.colEnd,
        columns,
        rowIds,
      ),
    }
  }
  if (direction === "right") {
    if (targetColumnIndex <= source.colEnd) return null
    return {
      targetRange: rangeFromBounds(
        source.rowStart,
        source.colStart,
        source.rowEnd,
        targetColumnIndex,
        columns,
        rowIds,
      ),
      fillRange: rangeFromBounds(
        source.rowStart,
        source.colEnd + 1,
        source.rowEnd,
        targetColumnIndex,
        columns,
        rowIds,
      ),
    }
  }
  if (targetColumnIndex >= source.colStart) return null
  return {
    targetRange: rangeFromBounds(
      source.rowStart,
      targetColumnIndex,
      source.rowEnd,
      source.colEnd,
      columns,
      rowIds,
    ),
    fillRange: rangeFromBounds(
      source.rowStart,
      targetColumnIndex,
      source.rowEnd,
      source.colStart - 1,
      columns,
      rowIds,
    ),
  }
}

function rangeFromBounds(
  rowStart: number,
  colStart: number,
  rowEnd: number,
  colEnd: number,
  columns: readonly RangeFillColumnRef[],
  rowIds: readonly RowId[],
): BcRange {
  const start = positionAt(rowStart, colStart, columns, rowIds)
  const end = positionAt(rowEnd, colEnd, columns, rowIds)
  if (!start || !end) {
    throw new Error("Range fill bounds are outside the current row/column model.")
  }
  return {
    start,
    end,
  }
}

function positionAt(
  rowIndex: number,
  colIndex: number,
  columns: readonly RangeFillColumnRef[],
  rowIds: readonly RowId[],
): BcCellPosition | null {
  const rowId = rowIds[rowIndex]
  const column = columns[colIndex]
  if (rowId == null || !column) return null
  return { rowId, columnId: column.columnId }
}

function stringifyFillValue(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
