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

describe("editor keyboard modifier-gating contract", () => {
  // Per editing-rfc §Keyboard model in edit mode: Ctrl / Alt / Meta on
  // any of the contract keys belong to the browser or the host app
  // (Ctrl+Enter is "send" in many forms; Cmd+Tab / Alt+Escape are
  // system shortcuts; Ctrl+F2 is sometimes a host accessibility
  // shortcut). Activation and edit-mode handlers MUST ignore them so
  // the host shortcut runs and we don't silently drop a typed commit.

  test("Ctrl / Alt / Meta on F2 or Enter activation are ignored (browser / host shortcut wins)", () => {
    for (const modifier of ["ctrlKey", "altKey", "metaKey"] as const) {
      expect(getEditorActivationIntent({ key: "F2", [modifier]: true })).toEqual({
        type: "ignore",
      })
      expect(getEditorActivationIntent({ key: "Enter", [modifier]: true })).toEqual({
        type: "ignore",
      })
    }
  })

  test("Shift+F2 and Shift+Enter still activate (Shift is the legitimate edit-mode modifier)", () => {
    // Shift+Enter is the canonical "commit + move up" gesture; the
    // activation arm has to accept it so the user can land directly
    // in edit mode with Shift held. Shift+F2 is harmless — there is
    // no documented host shortcut bound to it in the major browsers.
    expect(getEditorActivationIntent({ key: "F2", shiftKey: true })).toEqual({
      type: "start",
      activation: "f2",
    })
    expect(getEditorActivationIntent({ key: "Enter", shiftKey: true })).toEqual({
      type: "start",
      activation: "enter",
    })
  })

  test("Ctrl / Alt / Meta on Enter / Tab / Escape in edit mode are ignored (host shortcut wins)", () => {
    for (const modifier of ["ctrlKey", "altKey", "metaKey"] as const) {
      expect(getEditorEditModeKeyboardIntent({ key: "Enter", [modifier]: true })).toEqual({
        type: "ignore",
      })
      expect(getEditorEditModeKeyboardIntent({ key: "Tab", [modifier]: true })).toEqual({
        type: "ignore",
      })
      expect(getEditorEditModeKeyboardIntent({ key: "Escape", [modifier]: true })).toEqual({
        type: "ignore",
      })
    }
  })

  test("Ctrl + Shift + Enter etc. are ignored — Ctrl wins over Shift", () => {
    // The Shift-allowance only applies when Shift is the *only*
    // modifier. Ctrl + Shift + Enter is still a host shortcut
    // (commonly "send and add another" in form apps); we must not
    // claim it.
    expect(
      getEditorEditModeKeyboardIntent({ key: "Enter", shiftKey: true, ctrlKey: true }),
    ).toEqual({ type: "ignore" })
    expect(getEditorEditModeKeyboardIntent({ key: "Tab", shiftKey: true, metaKey: true })).toEqual({
      type: "ignore",
    })
  })

  test("Ctrl / Alt / Meta on a printable key continues to ignore (printable seed already gated)", () => {
    // Pre-existing behaviour — re-asserted under the new modifier-gate
    // helper so the contract stays uniform across all key paths.
    expect(getEditorActivationIntent({ key: "a", ctrlKey: true })).toEqual({ type: "ignore" })
    expect(getEditorActivationIntent({ key: "a", altKey: true })).toEqual({ type: "ignore" })
    expect(getEditorActivationIntent({ key: "a", metaKey: true })).toEqual({ type: "ignore" })
  })

  test("Shift on a printable key activates with the original key value (Shift is the casing modifier)", () => {
    // Shift+a → the browser already maps `event.key` to "A". The grid
    // doesn't re-derive casing; it forwards the resolved key to the
    // editor as the seed. This pin guards against a future regression
    // where a "no Shift on activation" rule sneaks in.
    expect(getEditorActivationIntent({ key: "A", shiftKey: true })).toEqual({
      type: "start",
      activation: "printable",
      seedKey: "A",
    })
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
