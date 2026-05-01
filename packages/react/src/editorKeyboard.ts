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
  // Ctrl / Alt / Meta on F2 or Enter belong to the browser or the host
  // app (Ctrl+Enter = "send" in many forms; Alt+F4 / Cmd+Q etc.). The
  // grid must not consume them. `Shift` is allowed because Shift+Enter
  // is a legitimate edit-activation modifier on AG Grid–style grids
  // (and bc-grid's edit-mode contract treats it as "commit and move
  // up").
  if (hasNonShiftModifier(input)) return { type: "ignore" }
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
  // Modifiers other than Shift never trigger commit / cancel — Ctrl+Tab
  // is browser tab navigation, Alt+Escape / Cmd+Escape are system
  // shortcuts, Ctrl+Enter is form-submit on many hosts. Letting any of
  // them flow through to the wrapper would steal a host shortcut and
  // silently drop a typed commit at the same time.
  if (hasNonShiftModifier(input)) return { type: "ignore" }
  if (input.key === "Enter") {
    return { type: "commit", moveOnSettle: input.shiftKey ? "up" : "down" }
  }
  if (input.key === "Tab") {
    return { type: "commit", moveOnSettle: input.shiftKey ? "left" : "right" }
  }
  if (input.key === "Escape") return { type: "cancel" }
  return { type: "ignore" }
}

function hasNonShiftModifier(input: EditorKeyInput): boolean {
  return input.ctrlKey === true || input.metaKey === true || input.altKey === true
}

function isPrintableEditSeed(input: EditorKeyInput): boolean {
  return input.key.length === 1
}
