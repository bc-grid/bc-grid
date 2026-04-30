import { describe, expect, test } from "bun:test"
import type { BcRange, ColumnId, RowId } from "@bc-grid/core"
import { resolveActiveRangeFillHandle, resolveRangeIndexBounds } from "../src/fillHandle"
import type { ResolvedColumn } from "../src/gridInternals"

interface Row {
  label: string
  amount: number
}

const columns: ResolvedColumn<Row>[] = [
  resolvedColumn("label", 0, 120),
  resolvedColumn("amount", 120, 80),
  resolvedColumn("status", 200, 100),
]
const rowIds = ["r1", "r2", "r3"] as RowId[]
const virtualRows = [
  { index: 0, top: 0, height: 36 },
  { index: 1, top: 36, height: 36 },
  { index: 2, top: 72, height: 36 },
]
const virtualCols = [
  { index: 0, left: 0, width: 120, pinned: null },
  { index: 1, left: 120, width: 80, pinned: null },
  { index: 2, left: 200, width: 100, pinned: null },
] as const

function resolvedColumn(columnId: string, left: number, width: number): ResolvedColumn<Row> {
  return {
    align: "left",
    columnId: columnId as ColumnId,
    left,
    pinned: null,
    position: left,
    source: { columnId, header: columnId },
    width,
  }
}

function range(startRow: string, startCol: string, endRow: string, endCol: string): BcRange {
  return {
    start: { rowId: startRow as RowId, columnId: startCol as ColumnId },
    end: { rowId: endRow as RowId, columnId: endCol as ColumnId },
  }
}

describe("fill handle layout", () => {
  test("normalises reversed active ranges to the visual bottom-right corner", () => {
    const bounds = resolveRangeIndexBounds(range("r3", "status", "r1", "label"), columns, rowIds)

    expect(bounds).toEqual({ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 })
  })

  test("positions the visual handle at the active range bottom-right cell", () => {
    const layout = resolveActiveRangeFillHandle({
      range: range("r1", "label", "r2", "amount"),
      columns,
      rowIds,
      virtualRows,
      virtualCols,
      scrollLeft: 0,
      totalWidth: 300,
      viewportWidth: 240,
    })

    expect(layout?.rowIndex).toBe(1)
    expect(layout?.colIndex).toBe(1)
    expect(layout?.style).toMatchObject({
      left: 200,
      top: 72,
      transform: "translate3d(-50%, -50%, 0)",
    })
  })

  test("does not render when the active range corner is not virtualized", () => {
    const layout = resolveActiveRangeFillHandle({
      range: range("r1", "label", "r3", "status"),
      columns,
      rowIds,
      virtualRows: virtualRows.slice(0, 2),
      virtualCols,
      scrollLeft: 0,
      totalWidth: 300,
      viewportWidth: 240,
    })

    expect(layout).toBeUndefined()
  })

  test("keeps pinned-right handles aligned with pinned cell transforms", () => {
    const layout = resolveActiveRangeFillHandle({
      range: range("r1", "status", "r1", "status"),
      columns,
      rowIds,
      virtualRows,
      virtualCols: [{ index: 2, left: 200, width: 100, pinned: "right" }],
      scrollLeft: 40,
      totalWidth: 300,
      viewportWidth: 220,
    })

    expect(layout?.style.transform).toBe("translate3d(-40px, 0, 0) translate3d(-50%, -50%, 0)")
  })
})
