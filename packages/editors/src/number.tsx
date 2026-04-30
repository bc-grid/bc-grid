import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react"

/**
 * Number editor — `kind: "number"`. Default for numeric columns per
 * `editing-rfc §editor-number`.
 *
 * Behaviour:
 *   - `inputMode="decimal"` triggers the numeric keyboard on touch
 *     devices (locale-aware decimal separator).
 *   - `seedKey`: only `0-9`, `.`, `,`, `-` are accepted as activation
 *     seeds; other printable keys fall through (the framework's
 *     activation guard never fires for non-numeric seeds since the
 *     editor decides what to render with).
 *   - F2 / Enter: select-all on mount (Excel default).
 *   - Commit produces a string; consumers wire `column.valueParser:
 *     (input) => parseFloat(input)` (or stricter parsing) to convert
 *     to `number` before validation. Range checks (`min` / `max`)
 *     belong in `column.validate`.
 *
 * Native `<input>` styled via theme CSS variables — no library dep.
 *
 * Note: the editing-rfc described editor-number as a "typed commit"
 * editor that produces `number` directly without going through
 * valueParser. v0.1 ships the simpler valueParser-driven path so
 * editor-number stays a thin UI layer; consumer columns express
 * parsing rules at the column level (where they're already defined
 * for read-side `format`). Typed-commit can land as a follow-up that
 * extends `BcCellEditorProps.commit` with a `moveOnSettle` opt; today
 * the framework's portal owns commit-key interception.
 */
export const numberEditor: BcCellEditor<unknown, unknown> = {
  Component: NumberEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "number",
}

const SEED_ACCEPT = /^[\d.,\-]$/

function NumberEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending } = props
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (focusRef && inputRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = inputRef.current
    }
  }, [focusRef])

  // F2 / Enter: select-all. Printable: caret at end.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    if (seedKey != null) {
      const len = input.value.length
      input.setSelectionRange(len, len)
    } else {
      input.select()
    }
  }, [seedKey])

  // seedKey filter: drop any non-numeric activation seed (the framework
  // doesn't know which printable chars are meaningful for this editor;
  // we silently ignore so the user's keystroke doesn't end up in the
  // input as garbage).
  const acceptedSeed = seedKey != null && SEED_ACCEPT.test(seedKey) ? seedKey : undefined
  const seeded =
    acceptedSeed != null ? acceptedSeed : initialValue == null ? "" : String(initialValue)

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      defaultValue={seeded}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="number"
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
  textAlign: "right",
}
