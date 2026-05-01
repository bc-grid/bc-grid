import { describe, expect, test } from "bun:test"
import type { BcColumnStateEntry } from "@bc-grid/core"
import { computeAutosizeWidth, upsertColumnStateEntry } from "../src/columnCommands"

describe("upsertColumnStateEntry", () => {
  test("appends a new entry when the column id isn't present", () => {
    const next = upsertColumnStateEntry([], "name", { width: 200 })
    expect(next).toEqual([{ columnId: "name", width: 200 }])
  })

  test("updates the targeted entry without touching the others", () => {
    const state: BcColumnStateEntry[] = [
      { columnId: "name", width: 100 },
      { columnId: "email", width: 200 },
      { columnId: "balance", width: 150 },
    ]
    const next = upsertColumnStateEntry(state, "email", { pinned: "left" })
    expect(next).toEqual([
      { columnId: "name", width: 100 },
      { columnId: "email", width: 200, pinned: "left" },
      { columnId: "balance", width: 150 },
    ])
  })

  test("partial patch merges with existing properties", () => {
    const state: BcColumnStateEntry[] = [
      { columnId: "name", width: 100, pinned: "left", hidden: false },
    ]
    const next = upsertColumnStateEntry(state, "name", { hidden: true })
    expect(next).toEqual([{ columnId: "name", width: 100, pinned: "left", hidden: true }])
  })

  test("setting pinned: null clears prior pinning", () => {
    const next = upsertColumnStateEntry([{ columnId: "name", pinned: "left" }], "name", {
      pinned: null,
    })
    expect(next).toEqual([{ columnId: "name", pinned: null }])
  })

  test("does not mutate the input array", () => {
    const state: readonly BcColumnStateEntry[] = [{ columnId: "name", width: 100 }]
    const next = upsertColumnStateEntry(state, "name", { width: 200 })
    expect(state).toEqual([{ columnId: "name", width: 100 }])
    expect(next).not.toBe(state)
  })
})

describe("computeAutosizeWidth", () => {
  test("returns null for an empty measurement set", () => {
    expect(computeAutosizeWidth([], { minWidth: 60, maxWidth: 800 })).toBeNull()
  })

  test("returns null when every measurement is non-positive", () => {
    expect(computeAutosizeWidth([0, 0, 0], { minWidth: 60, maxWidth: 800 })).toBeNull()
  })

  test("ceils to the widest measurement", () => {
    expect(computeAutosizeWidth([42.3], { minWidth: 60, maxWidth: 800 })).toBe(60)
    expect(computeAutosizeWidth([99.1, 105.4, 88], { minWidth: 60, maxWidth: 800 })).toBe(106)
  })

  test("clamps below minWidth", () => {
    expect(computeAutosizeWidth([10], { minWidth: 60, maxWidth: 800 })).toBe(60)
  })

  test("clamps above maxWidth", () => {
    expect(computeAutosizeWidth([1200], { minWidth: 60, maxWidth: 800 })).toBe(800)
  })

  test("respects unbounded maxWidth", () => {
    expect(computeAutosizeWidth([900], { minWidth: 60, maxWidth: Number.POSITIVE_INFINITY })).toBe(
      900,
    )
  })
})
