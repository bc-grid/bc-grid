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
  | { type: "ignore" }

export type EditorEditModeKeyboardIntent =
  | { type: "commit"; moveOnSettle: MoveOnSettle }
  | { type: "cancel" }
  | { type: "ignore" }

export function getEditorActivationIntent(input: EditorKeyInput): EditorActivationIntent {
  if (input.key === "F2") return { type: "start", activation: "f2" }
  if (input.key === "Enter") return { type: "start", activation: "enter" }
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
