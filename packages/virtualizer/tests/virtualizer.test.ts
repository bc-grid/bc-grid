import { describe, expect, test } from "bun:test"
import { Virtualizer } from "../src/virtualizer"

const baseOptions = {
  rowCount: 1000,
  colCount: 30,
  defaultRowHeight: 32,
  defaultColWidth: 120,
  viewportHeight: 600,
  viewportWidth: 1200,
}

describe("Virtualizer geometry", () => {
  test("uniform totalHeight = rowCount * rowHeight", () => {
    const v = new Virtualizer(baseOptions)
    expect(v.totalHeight()).toBe(1000 * 32)
  })

  test("uniform totalWidth = colCount * colWidth", () => {
    const v = new Virtualizer(baseOptions)
    expect(v.totalWidth()).toBe(30 * 120)
  })

  test("variable row heights propagate to totals", () => {
    const v = new Virtualizer(baseOptions)
    v.setRowHeight(0, 100)
    v.setRowHeight(1, 100)
    expect(v.totalHeight()).toBe(998 * 32 + 200)
  })

  test("rowOffset accumulates", () => {
    const v = new Virtualizer(baseOptions)
    expect(v.rowOffset(0)).toBe(0)
    expect(v.rowOffset(1)).toBe(32)
    expect(v.rowOffset(10)).toBe(320)
  })

  test("rowAtOffset binary search lands on correct row", () => {
    const v = new Virtualizer(baseOptions)
    expect(v.rowAtOffset(0)).toBe(0)
    expect(v.rowAtOffset(31)).toBe(0)
    expect(v.rowAtOffset(32)).toBe(1)
    expect(v.rowAtOffset(640)).toBe(20)
  })
})

describe("Virtualizer windowing", () => {
  test("computeWindow returns visible rows + overscan", () => {
    const v = new Virtualizer({ ...baseOptions, rowOverscan: 4 })
    v.setScrollTop(0)
    const window_ = v.computeWindow()
    // Viewport 600px / 32px row = ~19 visible rows
    // + 4 overscan top (clamped at 0) + 4 overscan bottom = ~23 rows
    expect(window_.rows.length).toBeGreaterThan(15)
    expect(window_.rows.length).toBeLessThan(30)
    expect(window_.rows[0]?.index).toBe(0)
  })

  test("computeWindow shifts when scroll position changes", () => {
    const v = new Virtualizer({ ...baseOptions, rowOverscan: 0 })
    v.setScrollTop(320) // 10 rows down
    const window_ = v.computeWindow()
    expect(window_.rows[0]?.index).toBe(10)
  })

  test("retained rows stay in window even when out of viewport", () => {
    const v = new Virtualizer(baseOptions)
    v.setScrollTop(10000) // far down
    v.retainRow(0)
    const window_ = v.computeWindow()
    const indexes = window_.rows.map((r) => r.index)
    expect(indexes).toContain(0)
  })

  test("retained columns stay in window during horizontal scroll", () => {
    const v = new Virtualizer(baseOptions)
    v.setScrollLeft(2000) // far right
    v.retainCol(0)
    const window_ = v.computeWindow()
    const indexes = window_.cols.map((c) => c.index)
    expect(indexes).toContain(0)
  })
})

describe("Virtualizer scroll alignment", () => {
  test("scrollOffsetForRow start aligns row top with viewport top", () => {
    const v = new Virtualizer(baseOptions)
    expect(v.scrollOffsetForRow(50, "start")).toBe(50 * 32)
  })

  test("scrollOffsetForRow end aligns row bottom with viewport bottom", () => {
    const v = new Virtualizer(baseOptions)
    // row 50 starts at 1600, ends at 1632; viewport 600
    // scrollTop = 1632 - 600 = 1032
    expect(v.scrollOffsetForRow(50, "end")).toBe(1032)
  })

  test("scrollOffsetForRow nearest does nothing when row is in viewport", () => {
    const v = new Virtualizer(baseOptions)
    v.setScrollTop(500)
    // row 20 is at 640, viewport is 500..1100, so row 20 is visible
    expect(v.scrollOffsetForRow(20, "nearest")).toBe(500)
  })
})

describe("Virtualizer scroll clamping", () => {
  test("scrollOffsetForRow clamps negative results to 0 (first row, end align)", () => {
    const v = new Virtualizer(baseOptions)
    // row 0 ends at 32; with viewport 600, naive end-align = 32 - 600 = -568
    // clamp to 0
    expect(v.scrollOffsetForRow(0, "end")).toBe(0)
  })

  test("scrollOffsetForRow clamps to max for last row, start align", () => {
    const v = new Virtualizer(baseOptions)
    // last row index = 999; rowOffset(999) = 999 * 32 = 31968
    // totalHeight = 32000; max scroll = 32000 - 600 = 31400
    expect(v.scrollOffsetForRow(999, "start")).toBe(31400)
  })

  test("scrollOffsetForCol clamps negative results to 0 (first col, end align)", () => {
    const v = new Virtualizer(baseOptions)
    // col 0 ends at 120; viewport 1200; naive end-align = 120 - 1200 = -1080
    expect(v.scrollOffsetForCol(0, "end")).toBe(0)
  })

  test("scrollOffsetForCol clamps to max for last col, start align", () => {
    const v = new Virtualizer(baseOptions)
    // last col index = 29; colOffset(29) = 29 * 120 = 3480
    // totalWidth = 3600; max scroll = 3600 - 1200 = 2400
    expect(v.scrollOffsetForCol(29, "start")).toBe(2400)
  })

  test("scrollOffsetForRow returns current scrollTop for out-of-range index", () => {
    const v = new Virtualizer(baseOptions)
    v.setScrollTop(200)
    expect(v.scrollOffsetForRow(-1, "start")).toBe(200)
    expect(v.scrollOffsetForRow(99999, "start")).toBe(200)
  })

  test("scrollOffsetForCol returns current scrollLeft for out-of-range index", () => {
    const v = new Virtualizer(baseOptions)
    v.setScrollLeft(50)
    expect(v.scrollOffsetForCol(-1, "start")).toBe(50)
    expect(v.scrollOffsetForCol(99999, "start")).toBe(50)
  })

  test("scrollOffsetForRow center clamps at viewport edges", () => {
    const v = new Virtualizer(baseOptions)
    // first row centered would be 32/2 - 600/2 = -284 → clamp 0
    expect(v.scrollOffsetForRow(0, "center")).toBe(0)
    // last row centered would be > max → clamp to max
    expect(v.scrollOffsetForRow(999, "center")).toBe(31400)
  })

  test("when total < viewport, scrollOffsetForRow always returns 0", () => {
    const v = new Virtualizer({
      ...baseOptions,
      rowCount: 5, // 5 * 32 = 160 < 600 viewport
    })
    expect(v.scrollOffsetForRow(0, "start")).toBe(0)
    expect(v.scrollOffsetForRow(0, "end")).toBe(0)
    expect(v.scrollOffsetForRow(4, "start")).toBe(0)
    expect(v.scrollOffsetForRow(4, "end")).toBe(0)
  })
})

describe("Virtualizer pinned regions", () => {
  test("pinned-top rows always rendered", () => {
    const v = new Virtualizer({ ...baseOptions, pinnedTopRows: 1 })
    v.setScrollTop(10000)
    const window_ = v.computeWindow()
    const indexes = window_.rows.map((r) => r.index)
    expect(indexes).toContain(0)
    expect(window_.rows.find((r) => r.index === 0)?.pinned).toBe("top")
  })

  test("pinned-left cols always rendered", () => {
    const v = new Virtualizer({ ...baseOptions, pinnedLeftCols: 2 })
    v.setScrollLeft(2000)
    const window_ = v.computeWindow()
    const indexes = window_.cols.map((c) => c.index)
    expect(indexes).toContain(0)
    expect(indexes).toContain(1)
    expect(window_.cols.find((c) => c.index === 0)?.pinned).toBe("left")
  })
})
