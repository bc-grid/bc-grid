import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useId, useLayoutEffect, useRef } from "react"
import {
  editorAccessibleName,
  editorControlState,
  editorInputClassName,
  visuallyHiddenStyle,
} from "./chrome"

/**
 * Checkbox editor — `kind: "checkbox"`. The built-in boolean editor for
 * checkbox-style columns.
 *
 * Behaviour:
 *   - Native `<input type="checkbox">` so Space toggles through browser
 *     semantics while the grid remains in edit mode.
 *   - Enter / Tab / Shift+Enter / Shift+Tab / Escape stay grid-owned via
 *     the editor portal wrapper.
 *   - Commit produces a boolean by reading `input.checked` in the React
 *     editor portal. Consumers that need non-boolean persistence should
 *     map the value in `onCellEditCommit` or `column.valueParser`.
 *   - Pending async validation / server commit disables the control.
 *
 * Tri-state is intentionally not enabled in this slice; it needs explicit
 * cycle semantics and `indeterminate` DOM-state handling before becoming a
 * stable public option.
 */
export const checkboxEditor: BcCellEditor<unknown, unknown> = {
  Component: CheckboxEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "checkbox",
}

/**
 * Strictly normalize an initial cell value for a boolean checkbox.
 * Only the boolean `true` checks the box; `false`, nullish values, and
 * string/number lookalikes stay unchecked so the editor does not silently
 * reinterpret non-boolean data on mount.
 */
export function resolveCheckboxCheckedValue(initialValue: unknown): boolean {
  return initialValue === true
}

function CheckboxEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, column } = props
  const inputRef = useRef<HTMLInputElement | null>(null)
  const errorId = useId()

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

  // Printable activation seeds do not apply to boolean values. The user can
  // press Space after mount to toggle via native checkbox behaviour.
  void seedKey

  const checked = resolveCheckboxCheckedValue(initialValue)
  const accessibleName = editorAccessibleName(column, "Checkbox value")

  return (
    <>
      <span
        className={`${editorInputClassName} bc-grid-editor-checkbox-shell`}
        aria-disabled={pending ? true : undefined}
        aria-invalid={error ? true : undefined}
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="checkbox"
        data-bc-grid-editor-state={editorControlState({ error, pending })}
      >
        <input
          ref={inputRef}
          className="bc-grid-editor-checkbox-control"
          type="checkbox"
          defaultChecked={checked}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-label={accessibleName || undefined}
          aria-describedby={error ? errorId : undefined}
        />
      </span>
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}
