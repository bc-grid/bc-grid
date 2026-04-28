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
