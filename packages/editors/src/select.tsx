import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useId, useLayoutEffect, useRef } from "react"
import {
  editorAccessibleName,
  editorControlState,
  editorDescribedBy,
  editorInputClassName,
  editorOptionToString,
  resolveEditorOptions,
  resolveSelectEditorState,
  shouldRenderLocalEditorError,
  visuallyHiddenStyle,
} from "./chrome"

const bcGridSelectOptionValuesKey = "__bcGridSelectOptionValues" as const

type BcGridSelectElement = HTMLSelectElement & {
  [bcGridSelectOptionValuesKey]?: readonly unknown[]
}

/**
 * Select editor — `kind: "select"`. Default for enum / one-of-many
 * columns per `editing-rfc §editor-select`.
 *
 * Behaviour:
 *   - Native `<select>` — browser provides the dropdown UI (touch-
 *     friendly on mobile, keyboard-navigable on desktop).
 *   - Options resolution: `column.options` — either a flat array
 *     (`[{ value, label }, ...]`) or a row-fn returning the same shape.
 *     Per-row options let one column drive different choices based on
 *     other fields (e.g., status options that depend on customer type).
 *   - F2 / Enter: focuses the select. Printable activation preselects
 *     the first label/value prefix match, then browser-native typeahead
 *     continues once focused.
 *   - Existing cell value pre-selects the matching option. If the
 *     current value isn't in the options list, the select renders a
 *     hidden disabled placeholder so Enter/Tab cannot silently commit
 *     the first option.
 *   - Commit produces the selected option's `value` (typed `TValue`).
 *     This is a typed editor — `valueParser` doesn't fire on commit
 *     (the framework only runs valueParser when the editor produces
 *     a string).
 *
 * No library dep. Browser variance: Chrome / Firefox use a styled
 * dropdown; Safari uses a native popover; mobile browsers use the
 * platform's native selector.
 */
export const selectEditor: BcCellEditor<unknown, unknown> = {
  Component: SelectEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "select",
}

function SelectEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, column, row, validationMessageId } =
    props
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const errorId = useId()

  useLayoutEffect(() => {
    if (focusRef && selectRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = selectRef.current
    }
    return () => {
      if (focusRef) {
        ;(focusRef as { current: HTMLElement | null }).current = null
      }
    }
  }, [focusRef])

  // Focus on mount; the framework's portal expects this.
  useLayoutEffect(() => {
    selectRef.current?.focus({ preventScroll: true })
  }, [])

  // Resolve options: flat array OR row-fn. Falls back to an empty list
  // so the editor still renders (with no choices) if a column forgot to
  // supply options.
  const optionsSource = (column as { options?: unknown }).options
  const options = resolveEditorOptions(optionsSource, row)
  const { defaultValue, hasSelectedOption, seedMatched, selectOptionValues } =
    resolveSelectEditorState({
      initialValue,
      options,
      seedKey,
    })

  useLayoutEffect(() => {
    if (selectRef.current) {
      ;(selectRef.current as BcGridSelectElement)[bcGridSelectOptionValuesKey] = selectOptionValues
    }
  }, [selectOptionValues])

  const accessibleName = editorAccessibleName(column, "Select value")
  const describedBy = editorDescribedBy({ error, localErrorId: errorId, validationMessageId })

  return (
    <>
      <select
        ref={selectRef}
        className={editorInputClassName}
        defaultValue={defaultValue}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-label={accessibleName}
        aria-describedby={describedBy}
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="select"
        data-bc-grid-editor-state={editorControlState({ error, pending })}
        data-bc-grid-editor-seeded={seedMatched ? "true" : undefined}
        data-bc-grid-editor-option-count={options.length}
      >
        {!hasSelectedOption ? (
          <option value="" disabled hidden>
            Select...
          </option>
        ) : null}
        {options.map((option) => (
          <option
            key={editorOptionToString(option.value)}
            value={editorOptionToString(option.value)}
          >
            {option.label}
          </option>
        ))}
      </select>
      {shouldRenderLocalEditorError(error, validationMessageId) ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}
