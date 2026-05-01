import type { CSSProperties } from "react"

export const editorInputClassName = "bc-grid-editor-input"

export type EditorControlState = "idle" | "pending" | "error"

export function editorControlState({
  error,
  pending,
}: {
  error?: string | undefined
  pending?: boolean | undefined
}): EditorControlState {
  if (pending) return "pending"
  if (error) return "error"
  return "idle"
}

export const visuallyHiddenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
}
