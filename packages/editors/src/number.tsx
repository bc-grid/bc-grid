import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useId, useLayoutEffect, useRef } from "react"
import {
  editorAccessibleName,
  editorControlState,
  editorInputClassName,
  visuallyHiddenStyle,
} from "./chrome"

/**
 * Number editor — `kind: "number"`. Default for numeric columns per
 * `editing-rfc §editor-number`.
 *
 * Behaviour:
 *   - `inputMode="decimal"` triggers the numeric keyboard on touch
 *     devices (locale-aware decimal separator).
 *   - `seedKey`: only `0-9`, `.`, `,`, `-` are accepted as activation
 *     seeds; other printable keys are silently dropped so a stray
 *     letter doesn't end up in the input as garbage.
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

/**
 * Predicate: is this seedKey acceptable as a numeric activation seed?
 *
 * Per `editing-rfc §editor-number`: digits, `.`, `,`, `-` only. Other
 * printable chars are dropped so the user doesn't end up with garbage
 * pre-seeded into the editor on activation.
 *
 * Pure so the seed semantics are unit-testable without mounting React.
 * Returns the seed string on accept; `undefined` on reject so the call
 * site can fall through to the existing-value path with the same
 * conditional shape used by `editor-text`.
 */
export function acceptNumericSeed(seedKey: string | undefined): string | undefined {
  if (seedKey == null) return undefined
  return SEED_ACCEPT.test(seedKey) ? seedKey : undefined
}

const SEED_ACCEPT = /^[\d.,\-]$/

function NumberEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, column } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  // Stable id per-editor-instance for aria-describedby → hidden error
  // span. Pairs with the cell-level error span the framework renders
  // so AT speaks the validator error regardless of focus target.
  const errorId = useId()

  // Hand the input back to the framework via `focusRef`. Runs in
  // useLayoutEffect so the assignment lands BEFORE the framework's
  // parent useLayoutEffect calls focusRef.current?.focus(). Children
  // fire first in React's commit phase. With useEffect here, focusRef
  // would be null at the framework's focus time and the input would
  // never receive DOM focus on real interaction. Mirrors the fix that
  // landed for `editor-text` in PR #155.
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

  const acceptedSeed = acceptNumericSeed(seedKey)
  const seeded =
    acceptedSeed != null ? acceptedSeed : initialValue == null ? "" : String(initialValue)

  // AT name: column.header when it's a string; else fall back to the
  // column id chain so the announcement at least carries the field
  // name. Per `editing-rfc §ARIA states on the cell`.
  const accessibleName = editorAccessibleName(column, "Number value")

  return (
    <>
      <input
        ref={inputRef}
        className={editorInputClassName}
        type="text"
        inputMode="decimal"
        defaultValue={seeded}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-label={accessibleName}
        aria-describedby={error ? errorId : undefined}
        aria-busy={pending ? true : undefined}
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="number"
        data-bc-grid-editor-state={editorControlState({ error, pending })}
        data-bc-grid-editor-disabled={pending ? "true" : undefined}
      />
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}
