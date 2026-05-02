import type { ActivationSource, MoveOnSettle } from "./editingStateMachine"

interface EditorKeyInput {
  key: string
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

export type EditorActivationIntent =
  | { type: "start"; activation: Extract<ActivationSource, "f2" | "enter"> }
  | { type: "start"; activation: "printable"; seedKey: string }
  | { type: "clear"; key: "Backspace" | "Delete" }
  | { type: "ignore" }

export type EditorEditModeKeyboardIntent =
  | { type: "commit"; moveOnSettle: MoveOnSettle }
  | { type: "cancel" }
  | { type: "ignore" }

export function getEditorActivationIntent(input: EditorKeyInput): EditorActivationIntent {
  if (input.key === "F2") return { type: "start", activation: "f2" }
  if (input.key === "Enter") return { type: "start", activation: "enter" }
  // Backspace / Delete clear the cell value, mirroring Excel + most
  // spreadsheet ERPs. Backspace also enters edit mode (so the user
  // can immediately type a replacement value); Delete stays in nav
  // mode (the "I want it empty, period" gesture). The grid wires
  // each key to the right activation in its keydown handler — we
  // surface the disambiguation here so the keymap is the single
  // source of truth. Audit P1-W3-1.
  //
  // Modifier keys disqualify (Cmd+Backspace / Ctrl+Delete are OS-level
  // "delete word/line" gestures the user expects to do nothing in
  // nav mode).
  if (
    (input.key === "Backspace" || input.key === "Delete") &&
    input.ctrlKey !== true &&
    input.metaKey !== true &&
    input.altKey !== true
  ) {
    return { type: "clear", key: input.key }
  }
  if (isPrintableEditSeed(input)) {
    return { type: "start", activation: "printable", seedKey: input.key }
  }
  return { type: "ignore" }
}

export function getEditorEditModeKeyboardIntent(
  input: EditorKeyInput,
): EditorEditModeKeyboardIntent {
  if (input.key === "Enter") {
    return { type: "commit", moveOnSettle: input.shiftKey ? "up" : "down" }
  }
  if (input.key === "Tab") {
    return { type: "commit", moveOnSettle: input.shiftKey ? "left" : "right" }
  }
  if (input.key === "Escape") return { type: "cancel" }
  return { type: "ignore" }
}

function isPrintableEditSeed(input: EditorKeyInput): boolean {
  return (
    input.key.length === 1 &&
    input.ctrlKey !== true &&
    input.metaKey !== true &&
    input.altKey !== true
  )
}
