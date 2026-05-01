import { describe, expect, test } from "bun:test"
import type { BcCellPosition, BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import { applyKeyboardRangeExtension } from "../src/rangeNavigation"

const emptyBcRangeSelection: BcRangeSelection = { ranges: [], anchor: null }
const rowIds = ["r1", "r2", "r3"] as RowId[]
const visibleColumns = [column("name"), column("amount"), column("status")]

describe("applyKeyboardRangeExtension", () => {
  test("seeds an empty selection from the active cell and extends it", () => {
    const next = applyKeyboardRangeExtension({
      activeCell: cell("r2", "name"),
      columns: visibleColumns,
      direction: "right",
      rangeSelection: emptyBcRangeSelection,
      rowIds,
      toEdge: false,
    })

    expect(next.activeCell).toEqual(cell("r2", "amount"))
    expect(next.rangeSelection).toEqual({
      ranges: [{ start: cell("r2", "name"), end: cell("r2", "amount") }],
      anchor: cell("r2", "name"),
    })
  })

  test("extends to the edge of the visible column list only", () => {
    const next = applyKeyboardRangeExtension({
      activeCell: cell("r1", "name"),
      columns: [column("name"), column("status")],
      direction: "right",
      rangeSelection: emptyBcRangeSelection,
      rowIds,
      toEdge: true,
    })

    expect(next.activeCell).toEqual(cell("r1", "status"))
    expect(next.rangeSelection.ranges[0]?.end.columnId).toBe("status")
    expect(next.rangeSelection.ranges[0]?.end.columnId).not.toBe("hidden")
  })

  test("does not create a range from a hidden or stale active column", () => {
    const next = applyKeyboardRangeExtension({
      activeCell: cell("r1", "hidden"),
      columns: visibleColumns,
      direction: "right",
      rangeSelection: emptyBcRangeSelection,
      rowIds,
      toEdge: false,
    })

    expect(next.rangeSelection).toBe(emptyBcRangeSelection)
    expect(next.activeCell).toEqual(cell("r1", "hidden"))
  })

  test("seeds from the active cell when it has moved away from the prior range", () => {
    const previous: BcRangeSelection = {
      ranges: [{ start: cell("r1", "name"), end: cell("r1", "amount") }],
      anchor: cell("r1", "name"),
    }

    const next = applyKeyboardRangeExtension({
      activeCell: cell("r3", "name"),
      columns: visibleColumns,
      direction: "right",
      rangeSelection: previous,
      rowIds,
      toEdge: false,
    })

    expect(next.rangeSelection).toEqual({
      ranges: [{ start: cell("r3", "name"), end: cell("r3", "amount") }],
      anchor: cell("r3", "name"),
    })
  })

  test("extends across the resolved column order once for pinned layouts", () => {
    const pinnedOrder = [column("left-pinned"), column("name"), column("amount"), column("actions")]
    const next = applyKeyboardRangeExtension({
      activeCell: cell("r2", "name"),
      columns: pinnedOrder,
      direction: "right",
      rangeSelection: emptyBcRangeSelection,
      rowIds,
      toEdge: true,
    })
    const range = next.rangeSelection.ranges[0]

    expect(range?.end).toEqual(cell("r2", "actions"))
    expect(range ? localColumnSpan(range.start.columnId, range.end.columnId, pinnedOrder) : 0).toBe(
      3,
    )
  })

  test("leaves an empty selection unchanged when no active cell exists", () => {
    const next = applyKeyboardRangeExtension({
      activeCell: null,
      columns: visibleColumns,
      direction: "right",
      rangeSelection: emptyBcRangeSelection,
      rowIds,
      toEdge: false,
    })

    expect(next.activeCell).toBeNull()
    expect(next.rangeSelection).toBe(emptyBcRangeSelection)
  })
})

function column(columnId: string): { readonly columnId: ColumnId } {
  return { columnId: columnId as ColumnId }
}

function cell(rowId: string, columnId: string): BcCellPosition {
  return { rowId: rowId as RowId, columnId: columnId as ColumnId }
}

function localColumnSpan(
  startColumnId: ColumnId,
  endColumnId: ColumnId,
  columns: readonly { readonly columnId: ColumnId }[],
): number {
  const startIndex = columns.findIndex((columnEntry) => columnEntry.columnId === startColumnId)
  const endIndex = columns.findIndex((columnEntry) => columnEntry.columnId === endColumnId)
  if (startIndex < 0 || endIndex < 0) return 0
  return Math.abs(endIndex - startIndex) + 1
}
