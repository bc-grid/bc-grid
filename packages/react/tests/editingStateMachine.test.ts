import { describe, expect, test } from "bun:test"
import type { BcCellPosition, RowId } from "@bc-grid/core"
import {
  type EditState,
  nextActiveCellAfterEdit,
  reduceEditState,
} from "../src/editingStateMachine"

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

  test("double-commit is absorbed — second commit while validating doesn't replace pendingValue", () => {
    // Per editing-rfc §Concurrency: a commit while we're already in
    // validating means the user pressed Enter twice fast. The first
    // pendingValue is still load-bearing (its async validator is in
    // flight); the second event is dropped at the machine level. The
    // controller's AbortSignal handles the underlying validator
    // cancellation if the user changes the value first; here we just
    // pin the machine-level absorption.
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "first", moveOnSettle: "down" })
    expect(s.mode).toBe("validating")

    const before = s
    const next = reduceEditState(s, { type: "commit", value: "second", moveOnSettle: "right" })
    expect(next).toBe(before)
    if (next.mode === "validating") {
      expect(next.pendingValue).toBe("first")
      expect(next.moveOnSettle).toBe("down")
    }
  })

  test("commit during committing is absorbed (the consumer hook is already in flight)", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "v", moveOnSettle: "down" })
    s = reduceEditState(s, { type: "validateResolved", result: { valid: true } })
    expect(s.mode).toBe("committing")
    const before = s

    const next = reduceEditState(s, { type: "commit", value: "newer", moveOnSettle: "right" })
    expect(next).toBe(before)
  })

  test("cancel during committing is absorbed (commit must run to settle for the overlay invariant)", () => {
    // Per editing-rfc §Server commit + optimistic UI: once the
    // overlay has been written and the consumer hook fired, the
    // user can no longer "cancel" — the rollback would race with the
    // consumer hook's own settle handler. The state machine absorbs
    // the cancel; the controller's AbortSignal is the only safe path
    // out of an in-flight async settle.
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "v", moveOnSettle: "down" })
    s = reduceEditState(s, { type: "validateResolved", result: { valid: true } })
    expect(s.mode).toBe("committing")
    const before = s

    const next = reduceEditState(s, { type: "cancel" })
    expect(next).toBe(before)
  })

  test("validateResolved during cancelling is absorbed (cancel wins over a late validator)", () => {
    // Esc during async validation: the controller dispatches `cancel`,
    // moving the machine to `cancelling`. If the original validator
    // resolves a tick later (its AbortSignal hadn't propagated yet),
    // the late resolution must NOT push the machine back to validating
    // → committing. Pin the absorption.
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "v", moveOnSettle: "down" })
    s = reduceEditState(s, { type: "cancel" })
    expect(s.mode).toBe("cancelling")
    const before = s

    const next = reduceEditState(s, { type: "validateResolved", result: { valid: true } })
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

describe("reduceEditState — prepare lifecycle", () => {
  test("prepareResolved with prepareResult flows through to editing", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareResolved", prepareResult: { meta: 42 } })
    expect(s.mode).toBe("mounting")
    if (s.mode === "mounting") expect(s.prepareResult).toEqual({ meta: 42 })
    s = reduceEditState(s, { type: "mounted" })
    expect(s.mode).toBe("editing")
    if (s.mode === "editing") expect(s.prepareResult).toEqual({ meta: 42 })
  })

  test("cancel during preparing returns straight to navigation (skips cancelling)", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "cancel" })
    expect(s.mode).toBe("navigation")
  })
})

describe("reduceEditState — cancel during validating", () => {
  test("cancel transitions validating → cancelling → unmounting → navigation", () => {
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "enter" })
    s = reduceEditState(s, { type: "prepareResolved" })
    s = reduceEditState(s, { type: "mounted" })
    s = reduceEditState(s, { type: "commit", value: "v", moveOnSettle: "down" })
    expect(s.mode).toBe("validating")
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
})

describe("nextActiveCellAfterEdit — Tab/Shift+Tab wrap per editing-rfc §Keyboard model", () => {
  test("'right' advances within a row", () => {
    expect(nextActiveCellAfterEdit(2, 0, 9, 4, "right")).toEqual({ row: 2, col: 1 })
    expect(nextActiveCellAfterEdit(0, 3, 9, 4, "right")).toEqual({ row: 0, col: 4 })
  })

  test("'right' at last column wraps to next row's first column", () => {
    expect(nextActiveCellAfterEdit(2, 4, 9, 4, "right")).toEqual({ row: 3, col: 0 })
  })

  test("'right' at the absolute last cell stays put", () => {
    expect(nextActiveCellAfterEdit(9, 4, 9, 4, "right")).toEqual({ row: 9, col: 4 })
  })

  test("'left' walks within a row", () => {
    expect(nextActiveCellAfterEdit(2, 4, 9, 4, "left")).toEqual({ row: 2, col: 3 })
    expect(nextActiveCellAfterEdit(2, 1, 9, 4, "left")).toEqual({ row: 2, col: 0 })
  })

  test("'left' at first column wraps to previous row's last column", () => {
    expect(nextActiveCellAfterEdit(2, 0, 9, 4, "left")).toEqual({ row: 1, col: 4 })
  })

  test("'left' at the absolute first cell stays put", () => {
    expect(nextActiveCellAfterEdit(0, 0, 9, 4, "left")).toEqual({ row: 0, col: 0 })
  })

  test("'down' / 'up' clamp at extents and don't wrap", () => {
    expect(nextActiveCellAfterEdit(0, 2, 9, 4, "up")).toEqual({ row: 0, col: 2 })
    expect(nextActiveCellAfterEdit(9, 2, 9, 4, "down")).toEqual({ row: 9, col: 2 })
    expect(nextActiveCellAfterEdit(4, 2, 9, 4, "down")).toEqual({ row: 5, col: 2 })
    expect(nextActiveCellAfterEdit(4, 2, 9, 4, "up")).toEqual({ row: 3, col: 2 })
  })

  test("'stay' is a no-op", () => {
    expect(nextActiveCellAfterEdit(3, 2, 9, 4, "stay")).toEqual({ row: 3, col: 2 })
  })
})
