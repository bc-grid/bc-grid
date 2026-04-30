import { describe, expect, test } from "bun:test"
import type { BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import { buildRangeOverlayRects } from "../src/rangeOverlay"

const columns = ["a", "b", "c", "d", "e"].map((columnId) => ({
  columnId: columnId as ColumnId,
}))
const rowIds = ["r1", "r2", "r3", "r4"].map((rowId) => rowId as RowId)

const geometry = {
  colCount: 5,
  pinnedLeftCols: 1,
  pinnedRightCols: 1,
  colOffset: (index: number) => index * 100,
  colWidth: () => 100,
  rowOffset: (index: number) => index * 32,
  rowHeight: () => 32,
}

function cell(rowId: string, columnId: string) {
  return { rowId: rowId as RowId, columnId: columnId as ColumnId }
}

describe("buildRangeOverlayRects", () => {
  test("builds a body rectangle from inclusive row/column bounds", () => {
    const selection: BcRangeSelection = {
      ranges: [{ start: cell("r2", "b"), end: cell("r3", "c") }],
      anchor: cell("r2", "b"),
    }

    expect(buildRangeOverlayRects({ selection, columns, rowIds, geometry })).toEqual([
      {
        key: "0-body-1-2",
        rangeIndex: 0,
        active: true,
        pinned: null,
        top: 32,
        left: 100,
        width: 200,
        height: 64,
      },
    ])
  })

  test("splits ranges that cross pinned-left, body, and pinned-right columns", () => {
    const selection: BcRangeSelection = {
      ranges: [{ start: cell("r1", "a"), end: cell("r2", "e") }],
      anchor: cell("r1", "a"),
    }

    expect(buildRangeOverlayRects({ selection, columns, rowIds, geometry })).toEqual([
      {
        key: "0-left-0-0",
        rangeIndex: 0,
        active: true,
        pinned: "left",
        top: 0,
        left: 0,
        width: 100,
        height: 64,
      },
      {
        key: "0-body-1-3",
        rangeIndex: 0,
        active: true,
        pinned: null,
        top: 0,
        left: 100,
        width: 300,
        height: 64,
      },
      {
        key: "0-right-4-4",
        rangeIndex: 0,
        active: true,
        pinned: "right",
        top: 0,
        left: 400,
        width: 100,
        height: 64,
      },
    ])
  })

  test("ignores stale row or column ids", () => {
    const selection: BcRangeSelection = {
      ranges: [{ start: cell("missing", "a"), end: cell("r2", "e") }],
      anchor: cell("r1", "a"),
    }

    expect(buildRangeOverlayRects({ selection, columns, rowIds, geometry })).toEqual([])
  })
})
