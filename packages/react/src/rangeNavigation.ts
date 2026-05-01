import type { BcCellPosition, BcRange, BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import type { KeyboardRangeDirection } from "./keyboard"

type RangeColumnRef = { readonly columnId: ColumnId }

export interface KeyboardRangeExtensionInput {
  activeCell: BcCellPosition | null
  columns: readonly RangeColumnRef[]
  direction: KeyboardRangeDirection
  rangeSelection: BcRangeSelection
  rowIds: readonly RowId[]
  toEdge: boolean
}

export interface KeyboardRangeExtensionResult {
  activeCell: BcCellPosition | null
  rangeSelection: BcRangeSelection
}

export function applyKeyboardRangeExtension({
  activeCell,
  columns,
  direction,
  rangeSelection,
  rowIds,
  toEdge,
}: KeyboardRangeExtensionInput): KeyboardRangeExtensionResult {
  if (!activeCell || !containsPosition(activeCell, columns, rowIds)) {
    return { activeCell, rangeSelection }
  }

  const seededSelection = shouldSeedFromActiveCell(rangeSelection, activeCell, columns, rowIds)
    ? { ranges: [newRangeAt(activeCell)], anchor: clonePosition(activeCell) }
    : rangeSelection
  const nextSelection = extendActiveRange(seededSelection, direction, toEdge, columns, rowIds)
  const activeRange = nextSelection.ranges[nextSelection.ranges.length - 1]

  return {
    activeCell: activeRange?.end ?? activeCell,
    rangeSelection: nextSelection,
  }
}

function shouldSeedFromActiveCell(
  selection: BcRangeSelection,
  activeCell: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): boolean {
  const activeRange = selection.ranges[selection.ranges.length - 1]
  if (!activeRange) return true
  if (!samePosition(activeRange.end, activeCell)) return true
  if (!containsPosition(activeRange.start, columns, rowIds)) return true
  if (!containsPosition(activeRange.end, columns, rowIds)) return true
  if (!selection.anchor) return true
  if (!containsPosition(selection.anchor, columns, rowIds)) return true
  return false
}

function extendActiveRange(
  selection: BcRangeSelection,
  direction: KeyboardRangeDirection,
  toEdge: boolean,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRangeSelection {
  const activeRange = selection.ranges[selection.ranges.length - 1]
  const anchor = selection.anchor ?? activeRange?.start ?? null
  if (!activeRange || !anchor) return selection

  const end = movePosition(activeRange.end, direction, toEdge, columns, rowIds)
  if (!end) return selection

  return replaceActiveRange(selection, { start: clonePosition(anchor), end }, anchor)
}

function movePosition(
  position: BcCellPosition,
  direction: KeyboardRangeDirection,
  toEdge: boolean,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcCellPosition | null {
  const index = resolvePosition(position, columns, rowIds)
  if (!index) return null

  let row = index.row
  let col = index.col
  if (direction === "up") row = toEdge ? 0 : row - 1
  else if (direction === "down") row = toEdge ? rowIds.length - 1 : row + 1
  else if (direction === "left") col = toEdge ? 0 : col - 1
  else col = toEdge ? columns.length - 1 : col + 1

  return positionAt(
    clamp(row, 0, rowIds.length - 1),
    clamp(col, 0, columns.length - 1),
    columns,
    rowIds,
  )
}

function replaceActiveRange(
  selection: BcRangeSelection,
  range: BcRange,
  anchor: BcCellPosition,
): BcRangeSelection {
  const ranges =
    selection.ranges.length === 0
      ? [range]
      : [...selection.ranges.slice(0, selection.ranges.length - 1), range]
  return { ranges, anchor: clonePosition(anchor) }
}

function newRangeAt(position: BcCellPosition): BcRange {
  return { start: clonePosition(position), end: clonePosition(position) }
}

function resolvePosition(
  position: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): { row: number; col: number } | null {
  const row = rowIds.indexOf(position.rowId)
  const col = columns.findIndex((column) => column.columnId === position.columnId)
  if (row < 0 || col < 0) return null
  return { row, col }
}

function positionAt(
  row: number,
  col: number,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcCellPosition | null {
  const rowId = rowIds[row]
  const column = columns[col]
  if (rowId == null || !column) return null
  return { rowId, columnId: column.columnId }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}

function containsPosition(
  position: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): boolean {
  return (
    rowIds.includes(position.rowId) &&
    columns.some((column) => column.columnId === position.columnId)
  )
}

function samePosition(left: BcCellPosition, right: BcCellPosition): boolean {
  return left.rowId === right.rowId && left.columnId === right.columnId
}

function clonePosition(position: BcCellPosition): BcCellPosition {
  return { rowId: position.rowId, columnId: position.columnId }
}
