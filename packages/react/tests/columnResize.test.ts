import { describe, expect, test } from "bun:test"
import {
  type ColumnResizeSession,
  commitColumnWidthState,
  computeResizedWidth,
} from "../src/columnResize"

const baseSession: ColumnResizeSession = {
  columnId: "name",
  startClientX: 200,
  startWidth: 120,
  minWidth: 48,
  maxWidth: 800,
}

describe("computeResizedWidth", () => {
  test("zero delta returns the starting width", () => {
    expect(computeResizedWidth(baseSession, 200)).toBe(120)
  })

  test("positive delta widens the column", () => {
    expect(computeResizedWidth(baseSession, 250)).toBe(170)
  })

  test("negative delta shrinks the column", () => {
    expect(computeResizedWidth(baseSession, 150)).toBe(70)
  })

  test("clamps below minWidth", () => {
    // Drag 200 px left of start: 120 - 200 = -80; clamps to 48.
    expect(computeResizedWidth(baseSession, 0)).toBe(48)
  })

  test("clamps above maxWidth", () => {
    // Drag 1000 px right of start: 120 + 1000 = 1120; clamps to 800.
    expect(computeResizedWidth(baseSession, 1200)).toBe(800)
  })

  test("dragging exactly to minWidth is exact", () => {
    // Need delta = 48 - 120 = -72; pointer at 200 - 72 = 128.
    expect(computeResizedWidth(baseSession, 128)).toBe(48)
  })

  test("Infinity maxWidth allows arbitrary growth", () => {
    expect(
      computeResizedWidth(
        { ...baseSession, maxWidth: Number.POSITIVE_INFINITY },
        baseSession.startClientX + 5000,
      ),
    ).toBe(5120)
  })

  test("equal min and max collapse to a fixed width", () => {
    expect(computeResizedWidth({ ...baseSession, minWidth: 200, maxWidth: 200 }, 500)).toBe(200)
    expect(computeResizedWidth({ ...baseSession, minWidth: 200, maxWidth: 200 }, 0)).toBe(200)
  })
})

describe("commitColumnWidthState", () => {
  test("updates width and clears flex on an existing column state entry", () => {
    expect(
      commitColumnWidthState(
        [
          { columnId: "code", width: 80 },
          { columnId: "name", flex: 2, pinned: "left", position: 1, width: 120 },
        ],
        "name",
        200,
      ),
    ).toEqual([
      { columnId: "code", width: 80 },
      { columnId: "name", flex: null, pinned: "left", position: 1, width: 200 },
    ])
  })

  test("adds width and flex null for a new column state entry", () => {
    expect(commitColumnWidthState([{ columnId: "code", width: 80 }], "name", 200)).toEqual([
      { columnId: "code", width: 80 },
      { columnId: "name", flex: null, width: 200 },
    ])
  })
})
