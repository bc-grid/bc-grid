import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useId, useLayoutEffect, useRef } from "react"
import { editorControlState, editorInputClassName, visuallyHiddenStyle } from "./chrome"

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

/**
 * Compute the value that mounts on the input.
 *   - `seedKey` (printable activation) wins — replaces cell content.
 *   - else fall back to the existing cell value, coerced safely.
 *   - null / undefined → empty string so the input is empty (not "null").
 *
 * Pure so the seed semantics are unit-testable per `editing-rfc
 * §Activation` without mounting React.
 */
export function resolveTextEditorSeed(initialValue: unknown, seedKey: string | undefined): string {
  if (seedKey != null) return seedKey
  if (initialValue == null) return ""
  return String(initialValue)
}

function TextEditor(props: BcCellEditorProps<unknown, string>) {
  const { initialValue, error, focusRef, seedKey, pending, column } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Stable id per-editor-instance so aria-describedby can target the
  // hidden error message text. `useId()` is stable across renders.
  const errorId = useId()

  // Hand the input element back to the framework via `focusRef`. This
  // assignment runs in `useLayoutEffect` so it lands BEFORE the
  // framework's parent `useLayoutEffect` (children fire first in the
  // commit phase). With `useEffect` here the framework's mount-focus
  // call would see `focusRef.current === null` and the input would
  // never receive focus on real interaction. Per `editing-rfc §a11y
  // for edit mode` ("real focus shifts to focusRef.current").
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

  const seeded = resolveTextEditorSeed(initialValue, seedKey)
  // Column header for the input's AT name. Falls back to `column.field`
  // when the header is not a plain string (e.g., header is a render
  // function). Per `editing-rfc §ARIA states on the cell` — the input
  // inherits its name from the column context so AT announces "{column}
  // edit text" instead of just "edit text".
  const accessibleName =
    typeof column.header === "string" ? column.header : (column.field ?? column.columnId ?? "")

  // v0.1 commit/cancel happens via Enter / Tab / Escape on the framework's
  // editor portal — the input is uncontrolled and the portal reads
  // `inputRef.current.value` at commit time. Document-level click-outside
  // commits via the portal's pointerdown listener.
  return (
    <>
      <input
        ref={inputRef}
        className={editorInputClassName}
        type="text"
        defaultValue={seeded}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-label={accessibleName || undefined}
        aria-describedby={error ? errorId : undefined}
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="text"
        data-bc-grid-editor-state={editorControlState({ error, pending })}
      />
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}
