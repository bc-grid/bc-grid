import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useLayoutEffect, useRef } from "react"
import { editorControlState, editorInputClassName } from "./chrome"

/**
 * Time editor — `kind: "time"`. Default for time-of-day columns per
 * `editing-rfc §editor-time`.
 *
 * Behaviour:
 *   - Native `<input type="time">` — browser provides the time picker
 *     (24h or 12h depending on locale + OS settings).
 *   - Format: `HH:mm` (24h) on commit. Display via `Intl.DateTimeFormat`
 *     with `timeStyle: "short"` is the consumer's responsibility (cell
 *     renderer / column.format).
 *   - F2 / Enter: opens the picker / focuses the input.
 *   - Printable activation: numeric seeds focus the hours field.
 *   - Commit produces a string in `HH:mm` form; consumers may add a
 *     `valueParser` if they need a different shape (e.g., a Date).
 *
 * No library dep — native input. Browser variance: Safari renders a
 * spinner, Chrome a popover, Firefox a clock-style picker. All emit
 * the same `HH:mm` value via `input.value`.
 */
export const timeEditor: BcCellEditor<unknown, unknown> = {
  Component: TimeEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "time",
}

function TimeEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, required, readOnly, disabled } = props
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Hand the input back to the framework via `focusRef`. Runs in
  // useLayoutEffect so the assignment lands BEFORE the framework's
  // parent useLayoutEffect calls focusRef.current?.focus() — children
  // fire first in React's commit phase. With useEffect here, focusRef
  // would be null when the framework reads it, and click-outside /
  // Tab / Enter commit would route through `readEditorInputValue(null)`
  // and silently commit `undefined`. Mirrors text.tsx / number.tsx.
  useLayoutEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
    return () => {
      if (focusRef) {
        ;(focusRef as { current: HTMLElement | null }).current = null
      }
    }
  }, [focusRef])

  // No select-all on time inputs — the browser owns the field structure
  // (HH | mm) and select() is a no-op on `type="time"` in most browsers.
  // We just focus the input; clicking / arrowing into a sub-field is
  // user-driven from there.
  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // seedKey: `<input type="time">` doesn't accept arbitrary seeds — its
  // value is parsed as HH:mm. Numeric seeds will move into the hours
  // field naturally on focus; non-numeric seeds are ignored. We don't
  // try to inject seedKey into the input value.
  void seedKey

  const seeded = normalizeTimeValue(initialValue)

  return (
    <input
      ref={inputRef}
      className={editorInputClassName}
      type="time"
      defaultValue={seeded}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      aria-required={required ? true : undefined}
      aria-readonly={readOnly ? true : undefined}
      aria-disabled={disabled || pending ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="time"
      data-bc-grid-editor-state={editorControlState({ error, pending })}
    />
  )
}

/**
 * Coerce arbitrary cell values to the `HH:mm` shape expected by
 * `<input type="time">`. Accepts:
 *   - already-formatted "HH:mm" or "HH:mm:ss" strings
 *   - Date instances (extracts hours/minutes in local time)
 *   - anything else → empty (lets the picker render unset)
 */
function normalizeTimeValue(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") {
    const match = value.match(/^(\d{2}):(\d{2})/)
    return match ? `${match[1]}:${match[2]}` : ""
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    const hh = String(value.getHours()).padStart(2, "0")
    const mm = String(value.getMinutes()).padStart(2, "0")
    return `${hh}:${mm}`
  }
  return ""
}
