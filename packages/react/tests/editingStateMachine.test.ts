import { describe, expect, test } from "bun:test"
import type { BcCellPosition, RowId } from "@bc-grid/core"
import { type EditState, reduceEditState } from "../src/editingStateMachine"

const cell: BcCellPosition = { rowId: "row-1" as RowId, columnId: "name" }
const initial: EditState<string> = { mode: "navigation" }

describe("reduceEditState — happy-path commit", () => {
  test("navigation → preparing on activate", () => {
    const next = reduceEditState(initial, {
      type: "activate",
      cell,
      activation: "f2",
    })
    expect(next.mode).toBe("preparing")
    if (next.mode === "preparing") {
      expect(next.cell).toBe(cell)
      expect(next.activation).toBe("f2")
    }
  })

  test("seedKey + pointerHint flow through preparing → mounting → editing", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, {
      type: "activate",
      cell,
      activation: "printable",
      seedKey: "x",
    })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    expect(s.mode).toBe("editing")
    if (s.mode === "editing") expect(s.seedKey).toBe("x")
  })

  test("editing → validating → committing → unmounting → navigation (sync valid path)", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "next-value", moveOnSettle: "down" })
    expect(s.mode).toBe("validating")
    if (s.mode === "validating") expect(s.pendingValue).toBe("next-value")

    s = reduceEditState(s, { type: "validateResolved", result: { valid: true } })
    expect(s.mode).toBe("committing")
    if (s.mode === "committing") expect(s.committedValue).toBe("next-value")

    s = reduceEditState(s, { type: "unmounted" })
    expect(s.mode).toBe("unmounting")
    if (s.mode === "unmounting") {
      expect(s.next.move).toBe("down")
      expect(s.next.committedValue).toBe("next-value")
    }

    s = reduceEditState(s, { type: "unmounted" })
    expect(s.mode).toBe("navigation")
  })
})

describe("reduceEditState — cancel paths", () => {
  test("editing → cancelling → unmounting → navigation", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "cancel" })
    expect(s.mode).toBe("cancelling")

    s = reduceEditState(s, { type: "unmounted" })
    expect(s.mode).toBe("unmounting")
    if (s.mode === "unmounting") {
      expect(s.next.move).toBe("stay")
      expect(s.next.committedValue).toBeUndefined()
    }

    s = reduceEditState(s, { type: "unmounted" })
    expect(s.mode).toBe("navigation")
  })

  test("cancel during preparing returns to navigation directly", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "cancel" })
    expect(s.mode).toBe("navigation")
  })

  test("prepareRejected returns to navigation", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareRejected", error: "boom" })
    expect(s.mode).toBe("navigation")
  })

  test("cancel during mounting transitions to cancelling (editor was about to mount)", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "cancel" })
    expect(s.mode).toBe("cancelling")
  })
})

describe("reduceEditState — invalid validation", () => {
  test("validating → editing on { valid: false } with error surfaced", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "bad", moveOnSettle: "down" })
    s = reduceEditState(s, {
      type: "validateResolved",
      result: { valid: false, error: "Required" },
    })
    expect(s.mode).toBe("editing")
    if (s.mode === "editing") expect(s.error).toBe("Required")
  })
})

describe("reduceEditState — invalid transitions are absorbed", () => {
  test("commit in navigation is a noop", () => {
    const next = reduceEditState(initial, {
      type: "commit",
      value: "x",
      moveOnSettle: "down",
    })
    expect(next).toBe(initial)
  })

  test("validateResolved in editing is a noop", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    const before = s
    const next = reduceEditState(s, { type: "validateResolved", result: { valid: true } })
    expect(next).toBe(before)
  })

  test("activate while already editing is a noop", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    const before = s
    const next = reduceEditState(s, {
      type: "activate",
      cell: { rowId: "row-2" as RowId, columnId: "other" },
      activation: "enter",
    })
    expect(next).toBe(before)
  })
})

describe("reduceEditState — moveOnSettle preserved across async boundary", () => {
  test("moveOnSettle 'right' set on commit survives validateResolved → committing → unmounting", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "v", moveOnSettle: "right" })
    s = reduceEditState(s, { type: "validateResolved", result: { valid: true } })
    s = reduceEditState(s, { type: "unmounted" })
    expect(s.mode).toBe("unmounting")
    if (s.mode === "unmounting") expect(s.next.move).toBe("right")
  })
})
