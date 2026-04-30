import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react"

/**
 * Text editor — `kind: "text"`. The default for string-typed columns
 * per `editing-rfc §editor-text`.
 *
 * Behaviour:
 *   - `seedKey`: replaces the cell's prior content; caret at end.
 *   - F2 sub-mode: noop (no advanced state for text).
 *   - String editor: produces a string; if `column.valueParser` is set,
 *     the framework calls it post-commit to convert string → TValue
 *     before validation. Otherwise the string lands in the overlay
 *     as-is.
 *   - No portal — single inline input.
 *
 * Native `<input type="text">` styled via the theme's CSS variables —
 * no library dep. Consumers wanting a richer popover wrap via
 * `column.cellEditor` with their own factory.
 *
 * Typed as `BcCellEditor<unknown, unknown>` so it assigns cleanly to any
 * column under `exactOptionalPropertyTypes`. The TextEditor component
 * internally narrows `props.initialValue` to a string at render.
 */
export const textEditor: BcCellEditor<unknown, unknown> = {
  Component: TextEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "text",
}

function TextEditor(props: BcCellEditorProps<unknown, string>) {
  const { initialValue, error, focusRef, seedKey, pending } = props
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Hand the input element back to the framework via `focusRef`. The
  // framework's editor portal uses this to call .focus() after mount.
  useEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
  }, [focusRef])

  // F2 / Enter activation: select-all on mount per `editing-rfc §F2 / Enter`.
  // Printable activation (`seedKey`): caret at end (the seeded value is
  // the entire content).
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    if (seedKey != null) {
      // Caret at end — already there from defaultValue mount.
      const len = input.value.length
      input.setSelectionRange(len, len)
    } else {
      // Excel-style: select-all so typing replaces.
      input.select()
    }
  }, [seedKey])

  // Compute the value the input mounts with. seedKey wins (printable
  // activation replaced the cell value); else render the existing value.
  const seeded = seedKey != null ? seedKey : (initialValue ?? "")

  // v0.1 commit/cancel happens via Enter / Tab / Escape on the framework's
  // editor portal — the input is uncontrolled and the portal reads
  // `inputRef.current.value` at commit time. The portal-aware click-outside
  // path (commit on blur) lands with the portal-click-outside follow-up.
  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={seeded}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="text"
      style={inputStyle}
    />
  )
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "2px solid hsl(var(--ring, 217 91% 60%))",
  borderRadius: "calc(var(--radius, 0.375rem) - 1px)",
  background: "hsl(var(--background, 0 0% 100%))",
  color: "inherit",
  font: "inherit",
  paddingInline: "var(--bc-grid-cell-padding-x, 12px)",
  outline: "none",
  boxSizing: "border-box",
}
