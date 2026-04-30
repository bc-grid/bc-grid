import { describe, expect, test } from "bun:test"
import type { BcRangeSelection, ColumnId, RowId } from "@bc-grid/core"
import type { ResolvedColumn } from "../src/gridInternals"
import { buildActiveRangeOverlayRects, rangeOverlayRectStyle } from "../src/rangeOverlay"

interface Row {
  a: string
  b: string
  c: string
  d: string
}

const rowIds = ["r1", "r2", "r3", "r4"].map((rowId) => rowId as RowId)
const columns: ResolvedColumn<Row>[] = [
  column("a", 0, "left"),
  column("b", 100, null),
  column("c", 200, null),
  column("d", 300, "right"),
]
const virtualRows = [
  { index: 0, top: 0, height: 32 },
  { index: 1, top: 32, height: 32 },
  { index: 2, top: 64, height: 32 },
  { index: 3, top: 96, height: 32 },
]
const virtualCols = [
  { index: 0, left: 0, width: 100, pinned: "left" as const },
  { index: 1, left: 100, width: 100, pinned: null },
  { index: 2, left: 200, width: 100, pinned: null },
  { index: 3, left: 300, width: 100, pinned: "right" as const },
]

function column(
  columnId: string,
  left: number,
  pinned: "left" | "right" | null,
): ResolvedColumn<Row> {
  return {
    align: "left",
    columnId: columnId as ColumnId,
    left,
    pinned,
    position: left,
    source: { columnId, header: columnId },
    width: 100,
  }
}

function cell(rowId: string, columnId: string) {
  return { rowId: rowId as RowId, columnId: columnId as ColumnId }
}

function selection(startRow: string, startCol: string, endRow: string, endCol: string) {
  return {
    ranges: [{ start: cell(startRow, startCol), end: cell(endRow, endCol) }],
    anchor: cell(startRow, startCol),
  } satisfies BcRangeSelection
}

function build(selection: BcRangeSelection, rows = virtualRows, cols = virtualCols) {
  return buildActiveRangeOverlayRects({
    selection,
    columns,
    rowIds,
    virtualRows: rows,
    virtualCols: cols,
  })
}

describe("range overlay", () => {
  test("builds a visible body rectangle for the active range", () => {
    expect(build(selection("r2", "b", "r3", "c"))).toEqual([
      {
        key: "1-2-body-1-2",
        pinned: null,
        top: 32,
        left: 100,
        width: 200,
        height: 64,
      },
    ])
  })

  test("splits visible rectangles across pinned regions", () => {
    expect(build(selection("r1", "a", "r2", "d"))).toEqual([
      { key: "0-1-left-0-0", pinned: "left", top: 0, left: 0, width: 100, height: 64 },
      { key: "0-1-body-1-2", pinned: null, top: 0, left: 100, width: 200, height: 64 },
      { key: "0-1-right-3-3", pinned: "right", top: 0, left: 300, width: 100, height: 64 },
    ])
  })

  test("uses only the active range when multiple ranges are present", () => {
    const multiRange: BcRangeSelection = {
      ranges: [
        { start: cell("r1", "a"), end: cell("r1", "a") },
        { start: cell("r3", "b"), end: cell("r4", "b") },
      ],
      anchor: cell("r3", "b"),
    }

    expect(build(multiRange)).toEqual([
      {
        key: "2-3-body-1-1",
        pinned: null,
        top: 64,
        left: 100,
        width: 100,
        height: 64,
      },
    ])
  })

  test("clips to currently virtualized rows and columns", () => {
    expect(
      build(selection("r1", "a", "r4", "d"), [virtualRows[1], virtualRows[3]], [virtualCols[2]]),
    ).toEqual([
      { key: "1-1-body-2-2", pinned: null, top: 32, left: 200, width: 100, height: 32 },
      { key: "3-3-body-2-2", pinned: null, top: 96, left: 200, width: 100, height: 32 },
    ])
  })

  test("ignores stale range endpoints", () => {
    expect(build(selection("missing", "a", "r4", "d"))).toEqual([])
  })

  test("applies pinned transforms to overlay rect styles", () => {
    expect(
      rangeOverlayRectStyle(
        { key: "right", pinned: "right", top: 0, left: 300, width: 100, height: 32 },
        40,
        400,
        260,
      ),
    ).toMatchObject({
      transform: "translate3d(-100px, 0, 0)",
    })
  })
})
