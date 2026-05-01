import { describe, expect, test } from "bun:test"
import type { BcCellPosition, BcRange, BcRangeSelection, ColumnId, RowId } from "../src"
import {
  emptyBcRangeSelection,
  expandRangeTo,
  newRangeAt,
  normaliseRange,
  parseRangeSelection,
  rangeBounds,
  rangeClear,
  rangeContains,
  rangeKeydown,
  rangePointerDown,
  rangePointerMove,
  rangePointerUp,
  rangeSelectAll,
  rangesContain,
  serializeRangeSelection,
} from "../src"

const rowIds = ["r1", "r2", "r3", "r4"].map((id) => id as RowId)
const columns = ["c1", "c2", "c3"].map((columnId) => ({ columnId: columnId as ColumnId }))

function cell(rowId: string, columnId: string): BcCellPosition {
  return { rowId: rowId as RowId, columnId: columnId as ColumnId }
}

describe("@bc-grid/core range helpers", () => {
  test("newRangeAt creates a 1x1 range without reusing the input object", () => {
    const position = cell("r2", "c2")
    const range = newRangeAt(position)

    expect(range).toEqual({ start: position, end: position })
    expect(range.start).not.toBe(position)
    expect(range.end).not.toBe(position)
  })

  test("rangeContains resolves reversed ranges by row and column order", () => {
    const range: BcRange = { start: cell("r4", "c3"), end: cell("r2", "c1") }

    expect(rangeContains(range, cell("r3", "c2"), columns, rowIds)).toBe(true)
    expect(rangeContains(range, cell("r1", "c2"), columns, rowIds)).toBe(false)
    expect(rangeContains(range, cell("r3", "missing"), columns, rowIds)).toBe(false)
  })

  test("rangesContain checks every range in a multi-range selection", () => {
    const selection: BcRangeSelection = {
      ranges: [
        { start: cell("r1", "c1"), end: cell("r1", "c2") },
        { start: cell("r3", "c2"), end: cell("r4", "c3") },
      ],
      anchor: cell("r3", "c2"),
    }

    expect(rangesContain(selection, cell("r1", "c2"), columns, rowIds)).toBe(true)
    expect(rangesContain(selection, cell("r4", "c3"), columns, rowIds)).toBe(true)
    expect(rangesContain(selection, cell("r2", "c2"), columns, rowIds)).toBe(false)
  })

  test("rangeBounds reports inclusive spans and returns zero for stale positions", () => {
    expect(
      rangeBounds({ start: cell("r4", "c3"), end: cell("r2", "c1") }, columns, rowIds),
    ).toEqual({ rowSpan: 3, colSpan: 3 })
    expect(
      rangeBounds({ start: cell("missing", "c3"), end: cell("r2", "c1") }, columns, rowIds),
    ).toEqual({ rowSpan: 0, colSpan: 0 })
  })

  test("normaliseRange returns ordered indexes and corner cells for reversed ranges", () => {
    expect(
      normaliseRange({ start: cell("r4", "c3"), end: cell("r2", "c1") }, columns, rowIds),
    ).toEqual({
      rowStart: 1,
      rowEnd: 3,
      colStart: 0,
      colEnd: 2,
      rowSpan: 3,
      colSpan: 3,
      topLeft: cell("r2", "c1"),
      bottomRight: cell("r4", "c3"),
    })
  })

  test("normaliseRange rejects stale endpoints and empty axes", () => {
    expect(
      normaliseRange({ start: cell("missing", "c3"), end: cell("r2", "c1") }, columns, rowIds),
    ).toBeUndefined()
    expect(
      normaliseRange({ start: cell("r1", "c1"), end: cell("r1", "c1") }, [], rowIds),
    ).toBeUndefined()
    expect(
      normaliseRange({ start: cell("r1", "c1"), end: cell("r1", "c1") }, columns, []),
    ).toBeUndefined()
  })

  test("expandRangeTo keeps the anchor and updates the frontier", () => {
    const active = { start: cell("r2", "c2"), end: cell("r2", "c2") }
    const next = expandRangeTo(active, cell("r4", "c3"), columns, rowIds)

    expect(next).toEqual({ start: cell("r2", "c2"), end: cell("r4", "c3") })
    expect(active).toEqual({ start: cell("r2", "c2"), end: cell("r2", "c2") })
  })

  test("expandRangeTo leaves stale ranges unchanged", () => {
    const active = { start: cell("missing", "c2"), end: cell("r2", "c2") }

    expect(expandRangeTo(active, cell("r4", "c3"), columns, rowIds)).toEqual(active)
  })
})

describe("@bc-grid/core range pointer state machine", () => {
  test("plain pointerdown clears prior ranges and moves the anchor", () => {
    const prior: BcRangeSelection = {
      ranges: [{ start: cell("r1", "c1"), end: cell("r4", "c3") }],
      anchor: cell("r1", "c1"),
    }

    expect(rangePointerDown(prior, cell("r2", "c2"), {})).toEqual({
      ranges: [{ start: cell("r2", "c2"), end: cell("r2", "c2") }],
      anchor: cell("r2", "c2"),
    })
  })

  test("shift pointerdown extends the active range from the existing anchor", () => {
    const prior = rangePointerDown(emptyBcRangeSelection, cell("r1", "c1"), {})

    expect(rangePointerDown(prior, cell("r3", "c3"), { shift: true })).toEqual({
      ranges: [{ start: cell("r1", "c1"), end: cell("r3", "c3") }],
      anchor: cell("r1", "c1"),
    })
  })

  test("ctrl/meta pointerdown appends a disjoint range", () => {
    const prior = rangePointerDown(emptyBcRangeSelection, cell("r1", "c1"), {})

    expect(rangePointerDown(prior, cell("r3", "c2"), { ctrlOrMeta: true })).toEqual({
      ranges: [
        { start: cell("r1", "c1"), end: cell("r1", "c1") },
        { start: cell("r3", "c2"), end: cell("r3", "c2") },
      ],
      anchor: cell("r3", "c2"),
    })
  })

  test("pointermove extends only the active range and preserves earlier ranges", () => {
    const first = rangePointerDown(emptyBcRangeSelection, cell("r1", "c1"), {})
    const second = rangePointerDown(first, cell("r3", "c2"), { ctrlOrMeta: true })
    const moved = rangePointerMove(second, cell("r4", "c3"), columns, rowIds)

    expect(moved).toEqual({
      ranges: [
        { start: cell("r1", "c1"), end: cell("r1", "c1") },
        { start: cell("r3", "c2"), end: cell("r4", "c3") },
      ],
      anchor: cell("r3", "c2"),
    })
    expect(second.ranges[1]).toEqual({ start: cell("r3", "c2"), end: cell("r3", "c2") })
  })

  test("pointerup finalizes without changing state", () => {
    const state = rangePointerDown(emptyBcRangeSelection, cell("r1", "c1"), {})

    expect(rangePointerUp(state)).toBe(state)
  })
})

describe("@bc-grid/core range keyboard state machine", () => {
  test("shift-arrow extends from the anchor through the active frontier", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r2", "c2"), {})
    const down = rangeKeydown(initial, { type: "extend", direction: "down" }, columns, rowIds)
    const right = rangeKeydown(down, { type: "extend", direction: "right" }, columns, rowIds)

    expect(right).toEqual({
      ranges: [{ start: cell("r2", "c2"), end: cell("r3", "c3") }],
      anchor: cell("r2", "c2"),
    })
  })

  test("ctrl/cmd-shift-arrow extends to the data edge", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r2", "c2"), {})

    expect(
      rangeKeydown(initial, { type: "extend", direction: "down", toEdge: true }, columns, rowIds),
    ).toEqual({
      ranges: [{ start: cell("r2", "c2"), end: cell("r4", "c2") }],
      anchor: cell("r2", "c2"),
    })
  })

  test("keyboard extension clamps at grid edges", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r4", "c3"), {})

    expect(rangeKeydown(initial, { type: "extend", direction: "down" }, columns, rowIds)).toEqual({
      ranges: [{ start: cell("r4", "c3"), end: cell("r4", "c3") }],
      anchor: cell("r4", "c3"),
    })
  })

  test("keyboard extension clamps at the upper-left grid edges", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r1", "c1"), {})

    expect(rangeKeydown(initial, { type: "extend", direction: "up" }, columns, rowIds)).toEqual({
      ranges: [{ start: cell("r1", "c1"), end: cell("r1", "c1") }],
      anchor: cell("r1", "c1"),
    })
    expect(rangeKeydown(initial, { type: "extend", direction: "left" }, columns, rowIds)).toEqual({
      ranges: [{ start: cell("r1", "c1"), end: cell("r1", "c1") }],
      anchor: cell("r1", "c1"),
    })
  })

  test("ctrl/cmd-shift-arrow clamps to the upper-left data edges", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r3", "c2"), {})
    const up = rangeKeydown(
      initial,
      { type: "extend", direction: "up", toEdge: true },
      columns,
      rowIds,
    )

    expect(up).toEqual({
      ranges: [{ start: cell("r3", "c2"), end: cell("r1", "c2") }],
      anchor: cell("r3", "c2"),
    })
    expect(
      rangeKeydown(up, { type: "extend", direction: "left", toEdge: true }, columns, rowIds),
    ).toEqual({
      ranges: [{ start: cell("r3", "c2"), end: cell("r1", "c1") }],
      anchor: cell("r3", "c2"),
    })
  })

  test("keyboard range actions are noops when no range is active", () => {
    expect(
      rangeKeydown(emptyBcRangeSelection, { type: "extend", direction: "down" }, columns, rowIds),
    ).toEqual(emptyBcRangeSelection)
    expect(rangeKeydown(emptyBcRangeSelection, { type: "select-row" }, columns, rowIds)).toEqual(
      emptyBcRangeSelection,
    )
    expect(rangeKeydown(emptyBcRangeSelection, { type: "select-column" }, columns, rowIds)).toEqual(
      emptyBcRangeSelection,
    )
    expect(rangeKeydown(emptyBcRangeSelection, { type: "clear" }, columns, rowIds)).toEqual(
      emptyBcRangeSelection,
    )
  })

  test("select-all creates a single full-grid range", () => {
    expect(rangeSelectAll(columns, rowIds)).toEqual({
      ranges: [{ start: cell("r1", "c1"), end: cell("r4", "c3") }],
      anchor: cell("r1", "c1"),
    })
    expect(rangeSelectAll([], rowIds)).toEqual(emptyBcRangeSelection)
    expect(rangeSelectAll(columns, [])).toEqual(emptyBcRangeSelection)
  })

  test("select-row uses the active frontier row and keeps the anchor", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r2", "c2"), {})
    const extended = rangeKeydown(initial, { type: "extend", direction: "down" }, columns, rowIds)

    expect(rangeKeydown(extended, { type: "select-row" }, columns, rowIds)).toEqual({
      ranges: [{ start: cell("r3", "c1"), end: cell("r3", "c3") }],
      anchor: cell("r2", "c2"),
    })
  })

  test("select-column uses the active frontier column and keeps the anchor", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r2", "c2"), {})
    const extended = rangeKeydown(initial, { type: "extend", direction: "right" }, columns, rowIds)

    expect(rangeKeydown(extended, { type: "select-column" }, columns, rowIds)).toEqual({
      ranges: [{ start: cell("r1", "c3"), end: cell("r4", "c3") }],
      anchor: cell("r2", "c2"),
    })
  })

  test("clear removes ranges and anchor", () => {
    const initial = rangePointerDown(emptyBcRangeSelection, cell("r2", "c2"), {})

    expect(rangeClear(initial)).toEqual(emptyBcRangeSelection)
    expect(rangeKeydown(initial, { type: "clear" }, columns, rowIds)).toEqual(emptyBcRangeSelection)
  })
})

describe("@bc-grid/core range serialization", () => {
  test("serializeRangeSelection produces a stable JSON shape", () => {
    const selection: BcRangeSelection = {
      ranges: [{ start: cell("r2", "c2"), end: cell("r4", "c3") }],
      anchor: cell("r2", "c2"),
    }

    expect(serializeRangeSelection(selection)).toBe(
      '{"ranges":[{"start":{"rowId":"r2","columnId":"c2"},"end":{"rowId":"r4","columnId":"c3"}}],"anchor":{"rowId":"r2","columnId":"c2"}}',
    )
  })

  test("parseRangeSelection round-trips valid selections", () => {
    const selection: BcRangeSelection = {
      ranges: [
        { start: cell("r1", "c1"), end: cell("r1", "c2") },
        { start: cell("r3", "c2"), end: cell("r4", "c3") },
      ],
      anchor: cell("r3", "c2"),
    }

    expect(parseRangeSelection(serializeRangeSelection(selection))).toEqual(selection)
    expect(parseRangeSelection(serializeRangeSelection(emptyBcRangeSelection))).toEqual(
      emptyBcRangeSelection,
    )
  })

  test("parseRangeSelection rejects malformed state", () => {
    expect(parseRangeSelection("not json")).toBeUndefined()
    expect(
      parseRangeSelection('{"ranges":[],"anchor":{"rowId":"r1","columnId":"c1"}}'),
    ).toBeUndefined()
    expect(
      parseRangeSelection(
        '{"ranges":[{"start":{"rowId":"","columnId":"c1"},"end":{"rowId":"r1","columnId":"c1"}}],"anchor":{"rowId":"r1","columnId":"c1"}}',
      ),
    ).toBeUndefined()
  })
})
