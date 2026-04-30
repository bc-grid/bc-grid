import type { BcCellPosition, BcRange, ColumnId, RowId } from "./index"

export interface BcRangeSelection {
  ranges: readonly BcRange[]
  anchor: BcCellPosition | null
}

export type BcRangeKeyAction =
  | {
      type: "extend"
      direction: "up" | "down" | "left" | "right"
      toEdge?: boolean
    }
  | { type: "select-all" }
  | { type: "select-row" }
  | { type: "select-column" }
  | { type: "clear" }

export const emptyBcRangeSelection: BcRangeSelection = { ranges: [], anchor: null }

type RangeColumnRef = { readonly columnId: ColumnId }

interface CellIndex {
  row: number
  col: number
}

export function newRangeAt(position: BcCellPosition): BcRange {
  return { start: clonePosition(position), end: clonePosition(position) }
}

export function rangeContains(
  range: BcRange,
  position: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): boolean {
  const bounds = resolveRangeIndexes(range, columns, rowIds)
  const index = resolvePosition(position, columns, rowIds)
  if (!bounds || !index) return false

  const rowStart = Math.min(bounds.start.row, bounds.end.row)
  const rowEnd = Math.max(bounds.start.row, bounds.end.row)
  const colStart = Math.min(bounds.start.col, bounds.end.col)
  const colEnd = Math.max(bounds.start.col, bounds.end.col)

  return (
    index.row >= rowStart && index.row <= rowEnd && index.col >= colStart && index.col <= colEnd
  )
}

export function rangesContain(
  selection: BcRangeSelection,
  position: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): boolean {
  return selection.ranges.some((range) => rangeContains(range, position, columns, rowIds))
}

export function rangeBounds(
  range: BcRange,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): { rowSpan: number; colSpan: number } {
  const bounds = resolveRangeIndexes(range, columns, rowIds)
  if (!bounds) return { rowSpan: 0, colSpan: 0 }

  return {
    rowSpan: Math.abs(bounds.end.row - bounds.start.row) + 1,
    colSpan: Math.abs(bounds.end.col - bounds.start.col) + 1,
  }
}

export function expandRangeTo(
  active: BcRange,
  target: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRange {
  const activeStart = resolvePosition(active.start, columns, rowIds)
  const targetIndex = resolvePosition(target, columns, rowIds)
  if (!activeStart || !targetIndex) return cloneRange(active)

  const end = positionAt(
    clamp(targetIndex.row, 0, rowIds.length - 1),
    clamp(targetIndex.col, 0, columns.length - 1),
    columns,
    rowIds,
  )
  if (!end) return cloneRange(active)
  return { start: clonePosition(active.start), end }
}

export function rangePointerDown(
  state: BcRangeSelection,
  target: BcCellPosition,
  modifiers: { shift?: boolean; ctrlOrMeta?: boolean },
): BcRangeSelection {
  if (modifiers.shift && state.anchor) {
    return replaceActiveRange(state, rangeFrom(state.anchor, target), state.anchor)
  }

  const next = newRangeAt(target)
  if (modifiers.ctrlOrMeta) {
    return {
      ranges: [...state.ranges, next],
      anchor: clonePosition(target),
    }
  }

  return { ranges: [next], anchor: clonePosition(target) }
}

export function rangePointerMove(
  state: BcRangeSelection,
  target: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRangeSelection {
  const active = activeRange(state)
  const anchor = state.anchor ?? active?.start ?? null
  if (!anchor) return state

  const next = expandRangeTo({ start: anchor, end: active?.end ?? anchor }, target, columns, rowIds)
  return replaceActiveRange(state, next, anchor)
}

export function rangePointerUp(state: BcRangeSelection): BcRangeSelection {
  return state
}

export function rangeKeydown(
  state: BcRangeSelection,
  action: BcRangeKeyAction,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRangeSelection {
  switch (action.type) {
    case "extend":
      return extendActiveRange(state, action.direction, action.toEdge === true, columns, rowIds)
    case "select-all":
      return rangeSelectAll(columns, rowIds)
    case "select-row":
      return selectActiveRow(state, columns, rowIds)
    case "select-column":
      return selectActiveColumn(state, columns, rowIds)
    case "clear":
      return rangeClear(state)
  }
}

export function rangeSelectAll(
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRangeSelection {
  const start = positionAt(0, 0, columns, rowIds)
  const end = positionAt(rowIds.length - 1, columns.length - 1, columns, rowIds)
  if (!start || !end) return emptyBcRangeSelection
  return { ranges: [{ start, end }], anchor: clonePosition(start) }
}

export function rangeClear(_state: BcRangeSelection): BcRangeSelection {
  return emptyBcRangeSelection
}

export function serializeRangeSelection(selection: BcRangeSelection): string {
  return JSON.stringify({
    ranges: selection.ranges.map((range) => ({
      start: serializePosition(range.start),
      end: serializePosition(range.end),
    })),
    anchor: selection.anchor ? serializePosition(selection.anchor) : null,
  })
}

export function parseRangeSelection(serialized: string): BcRangeSelection | undefined {
  try {
    return parseRangeSelectionValue(JSON.parse(serialized))
  } catch {
    return undefined
  }
}

function extendActiveRange(
  state: BcRangeSelection,
  direction: "up" | "down" | "left" | "right",
  toEdge: boolean,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRangeSelection {
  const active = activeRange(state)
  const anchor = state.anchor ?? active?.start ?? null
  if (!active || !anchor) return state

  const end = movePosition(active.end, direction, toEdge, columns, rowIds)
  if (!end) return state

  return replaceActiveRange(
    state,
    expandRangeTo({ start: anchor, end: active.end }, end, columns, rowIds),
    anchor,
  )
}

function selectActiveRow(
  state: BcRangeSelection,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRangeSelection {
  const active = activeRange(state)
  const activePosition = active?.end ?? state.anchor
  if (!activePosition) return state

  const index = resolvePosition(activePosition, columns, rowIds)
  const start = index ? positionAt(index.row, 0, columns, rowIds) : null
  const end = index ? positionAt(index.row, columns.length - 1, columns, rowIds) : null
  if (!start || !end) return state

  return replaceActiveRange(state, { start, end }, state.anchor ?? activePosition)
}

function selectActiveColumn(
  state: BcRangeSelection,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcRangeSelection {
  const active = activeRange(state)
  const activePosition = active?.end ?? state.anchor
  if (!activePosition) return state

  const index = resolvePosition(activePosition, columns, rowIds)
  const start = index ? positionAt(0, index.col, columns, rowIds) : null
  const end = index ? positionAt(rowIds.length - 1, index.col, columns, rowIds) : null
  if (!start || !end) return state

  return replaceActiveRange(state, { start, end }, state.anchor ?? activePosition)
}

function replaceActiveRange(
  state: BcRangeSelection,
  range: BcRange,
  anchor: BcCellPosition,
): BcRangeSelection {
  const ranges =
    state.ranges.length === 0 ? [range] : [...state.ranges.slice(0, state.ranges.length - 1), range]
  return { ranges, anchor: clonePosition(anchor) }
}

function activeRange(state: BcRangeSelection): BcRange | undefined {
  return state.ranges[state.ranges.length - 1]
}

function rangeFrom(start: BcCellPosition, end: BcCellPosition): BcRange {
  return { start: clonePosition(start), end: clonePosition(end) }
}

function cloneRange(range: BcRange): BcRange {
  return { start: clonePosition(range.start), end: clonePosition(range.end) }
}

function clonePosition(position: BcCellPosition): BcCellPosition {
  return { rowId: position.rowId, columnId: position.columnId }
}

function serializePosition(position: BcCellPosition): BcCellPosition {
  return { rowId: position.rowId, columnId: position.columnId }
}

function parseRangeSelectionValue(value: unknown): BcRangeSelection | undefined {
  if (!isRecord(value) || !Array.isArray(value.ranges)) return undefined

  const ranges: BcRange[] = []
  for (const range of value.ranges) {
    const parsed = parseRange(range)
    if (!parsed) return undefined
    ranges.push(parsed)
  }

  const anchor = value.anchor === null ? null : parsePosition(value.anchor)
  if (anchor === undefined) return undefined
  if ((ranges.length === 0) !== (anchor === null)) return undefined

  return { ranges, anchor }
}

function parseRange(value: unknown): BcRange | undefined {
  if (!isRecord(value)) return undefined
  const start = parsePosition(value.start)
  const end = parsePosition(value.end)
  if (!start || !end) return undefined
  return { start, end }
}

function parsePosition(value: unknown): BcCellPosition | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.rowId !== "string" || value.rowId.length === 0) return undefined
  if (typeof value.columnId !== "string" || value.columnId.length === 0) return undefined
  return { rowId: value.rowId, columnId: value.columnId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function resolveRangeIndexes(
  range: BcRange,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): { start: CellIndex; end: CellIndex } | undefined {
  const start = resolvePosition(range.start, columns, rowIds)
  const end = resolvePosition(range.end, columns, rowIds)
  if (!start || !end) return undefined
  return { start, end }
}

function resolvePosition(
  position: BcCellPosition,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): CellIndex | undefined {
  const row = rowIds.indexOf(position.rowId)
  const col = columns.findIndex((column) => column.columnId === position.columnId)
  if (row < 0 || col < 0) return undefined
  return { row, col }
}

function movePosition(
  position: BcCellPosition,
  direction: "up" | "down" | "left" | "right",
  toEdge: boolean,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcCellPosition | undefined {
  const index = resolvePosition(position, columns, rowIds)
  if (!index) return undefined

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

function positionAt(
  rowIndex: number,
  colIndex: number,
  columns: readonly RangeColumnRef[],
  rowIds: readonly RowId[],
): BcCellPosition | undefined {
  const rowId = rowIds[rowIndex]
  const column = columns[colIndex]
  if (rowId === undefined || column === undefined) return undefined
  return { rowId, columnId: column.columnId }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(max, Math.max(min, value))
}
