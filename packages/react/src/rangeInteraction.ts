import type { BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"

export interface RangeInteractionModel {
  rowIds: readonly RowId[]
  columnIds: readonly ColumnId[]
}

export function createRangeInteractionModel(
  rowIds: readonly RowId[],
  columns: readonly { columnId: ColumnId }[],
): RangeInteractionModel {
  return {
    rowIds: [...rowIds],
    columnIds: columns.map((column) => column.columnId),
  }
}

export function shouldClearRangeSelectionForModelChange(
  selection: BcRangeSelection,
  previous: RangeInteractionModel | null,
  next: RangeInteractionModel,
): boolean {
  if (!previous || selection.ranges.length === 0) return false
  return (
    !sameSequence(previous.rowIds, next.rowIds) || !sameSequence(previous.columnIds, next.columnIds)
  )
}

function sameSequence<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) return false
  return left.every((value, index) => Object.is(value, right[index]))
}
