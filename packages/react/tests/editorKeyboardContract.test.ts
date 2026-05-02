import { describe, expect, test } from "bun:test"
import type { BcCellPosition, ColumnId, RowId } from "@bc-grid/core"
import { type EditState, type MoveOnSettle, reduceEditState } from "../src/editingStateMachine"
import { getEditorActivationIntent, getEditorEditModeKeyboardIntent } from "../src/editorKeyboard"
import {
  type BcCellEditEntry,
  pruneOverlayPatches,
  summariseRowEditState,
} from "../src/useEditingController"

const rowId = "row-1" as RowId
const columnId = "name" as ColumnId
const cell: BcCellPosition = { rowId, columnId }
const initial: EditState<string> = { mode: "navigation" }

function mountedEditingStateFromKey(key: string): EditState<string> {
  const intent = getEditorActivationIntent({ key })
  if (intent.type !== "start") throw new Error(`expected ${key} to start editing`)

  let state = reduceEditState(initial, {
    type: "activate",
    cell,
    activation: intent.activation,
    ...(intent.activation === "printable" ? { seedKey: intent.seedKey } : {}),
  })
  state = reduceEditState(state, { type: "prepareResolved" })
  return reduceEditState(state, { type: "mounted" })
}

function makeEntry(overrides: Partial<BcCellEditEntry> = {}): BcCellEditEntry {
  return {
    pending: false,
    ...overrides,
  }
}

describe("editor keyboard activation contract", () => {
  test("F2 starts edit mode without seeding a value", () => {
    expect(getEditorActivationIntent({ key: "F2" })).toEqual({
      type: "start",
      activation: "f2",
    })

    const state = mountedEditingStateFromKey("F2")
    expect(state.mode).toBe("editing")
    if (state.mode === "editing") {
      expect(state.activation).toBe("f2")
      expect(state.seedKey).toBeUndefined()
    }
  })

  test("Enter starts edit mode without seeding a value", () => {
    expect(getEditorActivationIntent({ key: "Enter" })).toEqual({
      type: "start",
      activation: "enter",
    })

    const state = mountedEditingStateFromKey("Enter")
    expect(state.mode).toBe("editing")
    if (state.mode === "editing") {
      expect(state.activation).toBe("enter")
      expect(state.seedKey).toBeUndefined()
    }
  })

  test("printable keys start edit mode with seedKey unless a command modifier is held", () => {
    expect(getEditorActivationIntent({ key: "A" })).toEqual({
      type: "start",
      activation: "printable",
      seedKey: "A",
    })
    expect(getEditorActivationIntent({ key: "A", ctrlKey: true })).toEqual({ type: "ignore" })
    expect(getEditorActivationIntent({ key: "A", metaKey: true })).toEqual({ type: "ignore" })
    expect(getEditorActivationIntent({ key: "A", altKey: true })).toEqual({ type: "ignore" })

    const state = mountedEditingStateFromKey("A")
    expect(state.mode).toBe("editing")
    if (state.mode === "editing") {
      expect(state.activation).toBe("printable")
      expect(state.seedKey).toBe("A")
    }
  })

  test("Backspace and Delete emit a clear intent (audit P1-W3-1)", () => {
    // Excel-style clear semantics: Backspace + Delete both clear the
    // cell value. The disambiguation between "enter edit afterwards"
    // (Backspace) and "stay in nav" (Delete) lives in the grid's
    // keydown handler which inspects the discriminator key.
    expect(getEditorActivationIntent({ key: "Backspace" })).toEqual({
      type: "clear",
      key: "Backspace",
    })
    expect(getEditorActivationIntent({ key: "Delete" })).toEqual({
      type: "clear",
      key: "Delete",
    })
  })

  test("Cmd/Ctrl/Alt + Backspace/Delete are OS-level word/line gestures, not cell-clear", () => {
    // Cmd+Backspace deletes a word in macOS text fields, Ctrl+Delete
    // deletes the next word — both belong to the OS, not bc-grid.
    // Disqualifying modifier-held cases keeps those gestures available
    // when the user accidentally hits them while a cell is focused.
    expect(getEditorActivationIntent({ key: "Backspace", metaKey: true })).toEqual({
      type: "ignore",
    })
    expect(getEditorActivationIntent({ key: "Backspace", ctrlKey: true })).toEqual({
      type: "ignore",
    })
    expect(getEditorActivationIntent({ key: "Backspace", altKey: true })).toEqual({
      type: "ignore",
    })
    expect(getEditorActivationIntent({ key: "Delete", metaKey: true })).toEqual({
      type: "ignore",
    })
    expect(getEditorActivationIntent({ key: "Delete", ctrlKey: true })).toEqual({
      type: "ignore",
    })
    expect(getEditorActivationIntent({ key: "Delete", altKey: true })).toEqual({
      type: "ignore",
    })
  })
})

describe("editor edit-mode keyboard contract", () => {
  test("Enter and Tab variants commit with the expected post-settle movement", () => {
    const cases: Array<{
      key: string
      shiftKey?: boolean
      expectedMove: MoveOnSettle
    }> = [
      { key: "Enter", expectedMove: "down" },
      { key: "Enter", shiftKey: true, expectedMove: "up" },
      { key: "Tab", expectedMove: "right" },
      { key: "Tab", shiftKey: true, expectedMove: "left" },
    ]

    for (const entry of cases) {
      const intent = getEditorEditModeKeyboardIntent(entry)
      expect(intent).toEqual({ type: "commit", moveOnSettle: entry.expectedMove })

      let state = mountedEditingStateFromKey("Enter")
      state = reduceEditState(state, {
        type: "commit",
        value: "next",
        moveOnSettle: intent.type === "commit" ? intent.moveOnSettle : "stay",
      })
      expect(state.mode).toBe("validating")
      if (state.mode === "validating") {
        expect(state.pendingValue).toBe("next")
        expect(state.moveOnSettle).toBe(entry.expectedMove)
      }

      state = reduceEditState(state, { type: "validateResolved", result: { valid: true } })
      state = reduceEditState(state, { type: "unmounted" })
      expect(state.mode).toBe("unmounting")
      if (state.mode === "unmounting") {
        expect(state.next).toEqual({ move: entry.expectedMove, committedValue: "next" })
      }
    }
  })

  test("Escape cancels and returns to navigation without a committed value", () => {
    expect(getEditorEditModeKeyboardIntent({ key: "Escape" })).toEqual({ type: "cancel" })

    let state = mountedEditingStateFromKey("Enter")
    state = reduceEditState(state, { type: "cancel" })
    expect(state.mode).toBe("cancelling")
    state = reduceEditState(state, { type: "unmounted" })
    expect(state.mode).toBe("unmounting")
    if (state.mode === "unmounting") {
      expect(state.next).toEqual({ move: "stay" })
    }
    state = reduceEditState(state, { type: "unmounted" })
    expect(state.mode).toBe("navigation")
  })

  test("non-contract keys stay with the editor input", () => {
    expect(getEditorEditModeKeyboardIntent({ key: "F2" })).toEqual({ type: "ignore" })
    expect(getEditorEditModeKeyboardIntent({ key: "A" })).toEqual({ type: "ignore" })
    expect(getEditorEditModeKeyboardIntent({ key: "ArrowDown" })).toEqual({ type: "ignore" })
  })
})

describe("editor validation and pending commit contract", () => {
  test("validation rejection returns to editing with the error and no committed value", () => {
    let state = mountedEditingStateFromKey("Enter")
    state = reduceEditState(state, {
      type: "commit",
      value: "bad",
      moveOnSettle: "right",
    })
    expect(state.mode).toBe("validating")

    state = reduceEditState(state, {
      type: "validateResolved",
      result: { valid: false, error: "Required" },
    })
    expect(state.mode).toBe("editing")
    if (state.mode === "editing") {
      expect(state.error).toBe("Required")
    }
  })

  test("pending async commit state remains overlay-owned until the consumer settles", () => {
    const patches = new Map<RowId, Map<ColumnId, unknown>>([[rowId, new Map([[columnId, "next"]])]])
    const entries = new Map<RowId, Map<ColumnId, BcCellEditEntry>>([
      [rowId, new Map([[columnId, makeEntry({ pending: true, mutationId: "m-1" })]])],
    ])

    expect(summariseRowEditState(entries.get(rowId))).toEqual({ pending: true })
    expect(pruneOverlayPatches(patches, entries, () => "next")).toEqual({
      changed: false,
      cleared: 0,
    })
    expect(patches.get(rowId)?.get(columnId)).toBe("next")
    expect(entries.get(rowId)?.get(columnId)?.pending).toBe(true)
  })
})
