import { describe, expect, test } from "bun:test"
import { type KeyboardNavInput, nextKeyboardNav } from "../src/keyboard"

const baseInput: KeyboardNavInput = {
  key: "",
  ctrlOrMeta: false,
  shiftKey: false,
  currentRow: 5,
  currentCol: 3,
  lastRow: 99,
  lastCol: 9,
  pageRowCount: 20,
}

describe("nextKeyboardNav — arrow keys", () => {
  test("ArrowDown moves down 1", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowDown" })).toEqual({
      type: "move",
      row: 6,
      col: 3,
    })
  })

  test("ArrowUp moves up 1", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowUp" })).toEqual({
      type: "move",
      row: 4,
      col: 3,
    })
  })

  test("ArrowRight moves right 1", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowRight" })).toEqual({
      type: "move",
      row: 5,
      col: 4,
    })
  })

  test("ArrowLeft moves left 1", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowLeft" })).toEqual({
      type: "move",
      row: 5,
      col: 2,
    })
  })

  test("ArrowUp at row 0 stays at row 0 (preventDefault, no move)", () => {
    expect(nextKeyboardNav({ ...baseInput, currentRow: 0, key: "ArrowUp" })).toEqual({
      type: "preventDefault",
    })
  })

  test("ArrowDown at last row stays at last row", () => {
    expect(nextKeyboardNav({ ...baseInput, currentRow: 99, key: "ArrowDown" })).toEqual({
      type: "preventDefault",
    })
  })

  test("ArrowLeft at col 0 stays at col 0", () => {
    expect(nextKeyboardNav({ ...baseInput, currentCol: 0, key: "ArrowLeft" })).toEqual({
      type: "preventDefault",
    })
  })

  test("ArrowRight at last col stays at last col", () => {
    expect(nextKeyboardNav({ ...baseInput, currentCol: 9, key: "ArrowRight" })).toEqual({
      type: "preventDefault",
    })
  })
})

describe("nextKeyboardNav — Ctrl/Cmd + Arrow goes to extremes", () => {
  test("Ctrl+ArrowDown jumps to last row", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowDown", ctrlOrMeta: true })).toEqual({
      type: "move",
      row: 99,
      col: 3,
    })
  })

  test("Ctrl+ArrowUp jumps to first row", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowUp", ctrlOrMeta: true })).toEqual({
      type: "move",
      row: 0,
      col: 3,
    })
  })

  test("Ctrl+ArrowRight jumps to last col", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowRight", ctrlOrMeta: true })).toEqual({
      type: "move",
      row: 5,
      col: 9,
    })
  })

  test("Ctrl+ArrowLeft jumps to first col", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowLeft", ctrlOrMeta: true })).toEqual({
      type: "move",
      row: 5,
      col: 0,
    })
  })
})

describe("nextKeyboardNav — Home / End", () => {
  test("Home moves to first column in current row", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "Home" })).toEqual({
      type: "move",
      row: 5,
      col: 0,
    })
  })

  test("End moves to last column in current row", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "End" })).toEqual({
      type: "move",
      row: 5,
      col: 9,
    })
  })

  test("Ctrl+Home moves to first cell of grid", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "Home", ctrlOrMeta: true })).toEqual({
      type: "move",
      row: 0,
      col: 0,
    })
  })

  test("Ctrl+End moves to last cell of grid", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "End", ctrlOrMeta: true })).toEqual({
      type: "move",
      row: 99,
      col: 9,
    })
  })
})

describe("nextKeyboardNav — PageUp / PageDown", () => {
  test("PageDown moves by pageRowCount", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "PageDown" })).toEqual({
      type: "move",
      row: 25,
      col: 3,
    })
  })

  test("PageUp moves by pageRowCount", () => {
    expect(nextKeyboardNav({ ...baseInput, currentRow: 50, key: "PageUp" })).toEqual({
      type: "move",
      row: 30,
      col: 3,
    })
  })

  test("PageDown clamps at last row", () => {
    expect(nextKeyboardNav({ ...baseInput, currentRow: 90, key: "PageDown" })).toEqual({
      type: "move",
      row: 99,
      col: 3,
    })
  })

  test("PageUp from row 5 with pageRowCount 20 clamps at row 0", () => {
    expect(nextKeyboardNav({ ...baseInput, currentRow: 5, key: "PageUp" })).toEqual({
      type: "move",
      row: 0,
      col: 3,
    })
  })

  test("PageUp at row 0 returns preventDefault (already at top)", () => {
    expect(nextKeyboardNav({ ...baseInput, currentRow: 0, key: "PageUp" })).toEqual({
      type: "preventDefault",
    })
  })
})

describe("nextKeyboardNav — Q3-reserved keys swallow without moving", () => {
  test("Shift+ArrowDown returns preventDefault, no move", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "ArrowDown", shiftKey: true })).toEqual({
      type: "preventDefault",
    })
  })

  test("Ctrl+A returns preventDefault, no move", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "a", ctrlOrMeta: true })).toEqual({
      type: "preventDefault",
    })
    // Capital A too.
    expect(nextKeyboardNav({ ...baseInput, key: "A", ctrlOrMeta: true })).toEqual({
      type: "preventDefault",
    })
  })

  test("Shift+Space and Ctrl/Cmd+Space return preventDefault, no selection toggle", () => {
    expect(nextKeyboardNav({ ...baseInput, key: " ", shiftKey: true })).toEqual({
      type: "preventDefault",
    })
    expect(nextKeyboardNav({ ...baseInput, key: " ", ctrlOrMeta: true })).toEqual({
      type: "preventDefault",
    })
  })
})

describe("nextKeyboardNav — row selection", () => {
  test("Space toggles selection on the active row", () => {
    expect(nextKeyboardNav({ ...baseInput, key: " " })).toEqual({
      type: "toggleSelection",
    })
  })

  test("legacy Spacebar key name also toggles selection", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "Spacebar" })).toEqual({
      type: "toggleSelection",
    })
  })
})

describe("nextKeyboardNav — Q2-reserved keys are noop (caller falls through to editor)", () => {
  test("F2 is noop", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "F2" })).toEqual({ type: "noop" })
  })

  test("Enter is noop", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "Enter" })).toEqual({ type: "noop" })
  })

  test("Escape is noop", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "Escape" })).toEqual({ type: "noop" })
  })

  test("Printable character (e.g. 'a' without Ctrl) is noop", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "a" })).toEqual({ type: "noop" })
  })

  test("Unknown key is noop", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "Insert" })).toEqual({ type: "noop" })
  })

  test("Tab is noop (browser default moves focus out of grid)", () => {
    expect(nextKeyboardNav({ ...baseInput, key: "Tab" })).toEqual({ type: "noop" })
    expect(nextKeyboardNav({ ...baseInput, key: "Tab", shiftKey: true })).toEqual({
      type: "noop",
    })
  })
})

describe("nextKeyboardNav — empty grid", () => {
  test("zero rows / zero cols returns noop", () => {
    expect(nextKeyboardNav({ ...baseInput, lastRow: -1, lastCol: -1, key: "ArrowDown" })).toEqual({
      type: "noop",
    })
  })
})
