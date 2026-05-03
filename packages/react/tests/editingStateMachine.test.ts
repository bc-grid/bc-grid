import { describe, expect, test } from "bun:test"
import type { BcCellPosition, RowId } from "@bc-grid/core"
import {
  type EditState,
  nextActiveCellAfterEdit,
  nextEditableCellAfterEdit,
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

  test("prepareRejected mounts the editor with no preload (graceful degradation, audit P1-W3-2)", () => {
    // Pre-v0.5: prepareRejected returned to navigation, silently
    // blocking edit when preload failed (a vendor-lookup grid on a
    // flaky network would lose every cell-edit gesture). Now the
    // machine mounts with `prepareResult: undefined` so the editor
    // falls through to its synchronous `column.options` /
    // first-keystroke `fetchOptions` path. The framework still
    // suppresses the error for AT users today; consumers who want a
    // hard "no edit on prepare failure" can return a sentinel from
    // `prepare` that the Component checks instead.
    let s: EditState<string> = initial
    s = reduceEditState(s, { type: "activate", cell, activation: "f2" })
    s = reduceEditState(s, { type: "prepareRejected", error: "boom" })
    expect(s.mode).toBe("mounting")
    if (s.mode === "mounting") {
      expect(s.cell).toEqual(cell)
      expect(s.activation).toBe("f2")
      expect(s.prepareResult).toBeUndefined()
    }
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

describe("nextEditableCellAfterEdit — Tab/Shift+Tab skip non-editable cells", () => {
  // Worker3 v06-editor-keyboard-navigation-polish — pre-fix Tab on
  // the last editable cell in a row advanced to the literal next
  // column (often non-editable) and then no-oped, leaving the user
  // stranded at a non-editable cell. The new helper scans in linear
  // tab order and skips non-editable cells + disabled rows. Down /
  // up keep the same-column behaviour (mirrors AG Grid).
  //
  // Cell editability is encoded in a callback; tests use simple
  // grid layouts and assert the destination row/col index.

  // 5×5 grid with editable columns 0, 2, 4 (odd columns are
  // non-editable display-only). All rows are data rows.
  const allRowsEditable = (_r: number, c: number): boolean => c % 2 === 0

  test("Tab skips an immediate non-editable column", () => {
    // Row 2, col 0 (editable) → naive next is col 1 (non-editable),
    // helper scans forward to col 2 (editable).
    expect(nextEditableCellAfterEdit(2, 0, 4, 4, "right", allRowsEditable)).toEqual({
      row: 2,
      col: 2,
    })
  })

  test("Tab from the last editable cell of a row wraps to first editable cell of next row", () => {
    // Row 1, col 4 (last editable) → wraps to row 2, col 0 (first
    // editable). Pre-fix this would have moved to row 2 col 0
    // because col 4 is the last col anyway, so this case happens
    // to work — but the next test exposes the actual bug.
    expect(nextEditableCellAfterEdit(1, 4, 4, 4, "right", allRowsEditable)).toEqual({
      row: 2,
      col: 0,
    })
  })

  test("Tab from the LAST EDITABLE cell of a row (not the last col) wraps to next row, skipping trailing non-editable cols", () => {
    // 5×6 grid where editable cols are [0, 1, 2, 3] — cols 4 + 5
    // are read-only display columns. Row 2, col 3 (last editable)
    // should wrap to row 3, col 0 (first editable in next row),
    // NOT advance to col 4 (non-editable) and no-op there.
    const editableLeft = (_r: number, c: number): boolean => c <= 3
    expect(nextEditableCellAfterEdit(2, 3, 4, 5, "right", editableLeft)).toEqual({
      row: 3,
      col: 0,
    })
  })

  test("Tab through multiple non-editable rows advances to the next editable row", () => {
    // Rows 0, 2, 4 are editable; rows 1 and 3 are disabled (entire
    // row reads as non-editable for every column). Tab from row 0
    // col 4 should wrap to row 2 col 0 (skipping disabled row 1).
    const skipDisabledRows = (r: number, _c: number): boolean => r % 2 === 0
    expect(nextEditableCellAfterEdit(0, 4, 4, 4, "right", skipDisabledRows)).toEqual({
      row: 2,
      col: 0,
    })
  })

  test("Shift+Tab is symmetrical — skips non-editable cols backwards", () => {
    // Row 2 col 2 (editable) → naive prev is col 1 (non-editable),
    // helper scans backward to col 0 (editable).
    expect(nextEditableCellAfterEdit(2, 2, 4, 4, "left", allRowsEditable)).toEqual({
      row: 2,
      col: 0,
    })
  })

  test("Shift+Tab from the FIRST EDITABLE cell wraps to the previous row's last editable col", () => {
    const editableLeft = (_r: number, c: number): boolean => c <= 3
    expect(nextEditableCellAfterEdit(2, 0, 4, 5, "left", editableLeft)).toEqual({
      row: 1,
      col: 3,
    })
  })

  test("Tab clamps when no editable cell exists ahead (stays put)", () => {
    // Row 9 col 4 with NO editable cells anywhere — would scan past
    // the end and clamp back to the original cell (no-op).
    const noneEditable = (_r: number, _c: number): boolean => false
    expect(nextEditableCellAfterEdit(2, 2, 9, 4, "right", noneEditable)).toEqual({
      row: 2,
      col: 2,
    })
  })

  test("Shift+Tab clamps when no editable cell exists behind (stays put)", () => {
    const noneEditable = (_r: number, _c: number): boolean => false
    expect(nextEditableCellAfterEdit(2, 2, 9, 4, "left", noneEditable)).toEqual({
      row: 2,
      col: 2,
    })
  })

  test("down move keeps current behaviour — same column even when target cell is non-editable", () => {
    // Mirrors AG Grid: Enter / Shift+Enter is a vertical move; the
    // user pressed down, so they want to land on the next row's
    // same column regardless of editability. The bug we're fixing
    // is Tab/Shift+Tab specifically.
    const allRowsEditable = (_r: number, c: number): boolean => c % 2 === 0
    // Row 4 col 2 (editable) + "down" → row 5 col 2 (still editable,
    // delegates to nextActiveCellAfterEdit which doesn't skip).
    expect(nextEditableCellAfterEdit(4, 2, 9, 4, "down", allRowsEditable)).toEqual({
      row: 5,
      col: 2,
    })
  })

  test("up move keeps current behaviour — same column even when target cell is non-editable", () => {
    const allRowsEditable = (_r: number, c: number): boolean => c % 2 === 0
    expect(nextEditableCellAfterEdit(4, 2, 9, 4, "up", allRowsEditable)).toEqual({
      row: 3,
      col: 2,
    })
  })

  test("'stay' move is delegated as a no-op (matches nextActiveCellAfterEdit)", () => {
    // The predicate is never consulted — pin its absence.
    const oracle = (_r: number, _c: number): boolean => {
      throw new Error("predicate must not be consulted for 'stay' move")
    }
    expect(nextEditableCellAfterEdit(3, 2, 9, 4, "stay", oracle)).toEqual({ row: 3, col: 2 })
  })

  test("Tab clamps at the absolute last cell when no further editable cell exists", () => {
    // Row 9 col 4 (the last cell) + "right" should clamp regardless
    // of editability — there's nowhere to go.
    const allRowsEditable = (_r: number, c: number): boolean => c % 2 === 0
    expect(nextEditableCellAfterEdit(9, 4, 9, 4, "right", allRowsEditable)).toEqual({
      row: 9,
      col: 4,
    })
  })

  test("Shift+Tab clamps at the absolute first cell when no further editable cell exists", () => {
    const allRowsEditable = (_r: number, c: number): boolean => c % 2 === 0
    expect(nextEditableCellAfterEdit(0, 0, 9, 4, "left", allRowsEditable)).toEqual({
      row: 0,
      col: 0,
    })
  })
})
