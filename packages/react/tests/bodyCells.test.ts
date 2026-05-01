import { describe, expect, test } from "bun:test"
import { cellChromeZIndex } from "../src/bodyCells"

describe("cellChromeZIndex", () => {
  test("keeps ordinary cells on the default virtualized stacking level", () => {
    expect(cellChromeZIndex({ active: false, editState: undefined, pinned: false })).toBeUndefined()
    expect(cellChromeZIndex({ active: false, editState: undefined, pinned: true })).toBeUndefined()
  })

  test("raises dirty, pending, and error cells above range overlays", () => {
    for (const editState of ["dirty", "pending", "error"] as const) {
      expect(cellChromeZIndex({ active: false, editState, pinned: false })).toBe(6)
      expect(cellChromeZIndex({ active: false, editState, pinned: true })).toBe(8)
    }
  })

  test("active cells win over edit markers and pinned range overlays", () => {
    expect(cellChromeZIndex({ active: true, editState: undefined, pinned: false })).toBe(7)
    expect(cellChromeZIndex({ active: true, editState: "dirty", pinned: false })).toBe(7)
    expect(cellChromeZIndex({ active: true, editState: undefined, pinned: true })).toBe(9)
    expect(cellChromeZIndex({ active: true, editState: "error", pinned: true })).toBe(9)
  })
})
