import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useEffect, useId, useLayoutEffect, useRef } from "react"
import {
  editorAccessibleName,
  editorControlState,
  editorInputClassName,
  visuallyHiddenStyle,
} from "./chrome"

const bcGridSelectOptionValuesKey = "__bcGridSelectOptionValues" as const

type BcGridSelectElement = HTMLSelectElement & {
  [bcGridSelectOptionValuesKey]?: readonly unknown[]
}

/**
 * Multi-select editor — `kind: "multi-select"`. Default for many-of-many
 * columns per `editing-rfc §editor-multi-select`. Native
 * `<select multiple>` — no library dep, no portal.
 *
 * Behaviour:
 *   - Native `<select multiple size="N">`. Browser drives the chip / list
 *     UI. Touch-friendly on mobile, keyboard-navigable on desktop
 *     (Space toggles selection, Shift+Click extends, Ctrl+Click toggles).
 *   - Options resolution: `column.options` — flat array or row-fn,
 *     identical to `editor-select` per RFC §editor-multi-select.
 *   - `initialValue: readonly TValue[]` — every value present in the
 *     array maps to a `selected` option. Values not present in the
 *     options list are silently dropped (the framework's option-keyed
 *     lookup at commit only returns values that exist in the list).
 *   - Commit produces `readonly TValue[]` — typed values. The framework's
 *     `readEditorInputValue` iterates `selectedOptions` and maps each
 *     `option.index` back to the typed value via the same option-keyed
 *     lookup that `editor-select` populates. This is a typed editor —
 *     `column.valueParser` doesn't fire on commit per RFC.
 *   - `seedKey` ignored — multi-select is choose-from-list, not text-seed.
 *   - `pending` disables the entire control while async work is in flight.
 *
 * No library dep. Browser variance: Chrome / Firefox render a list-box
 * with multi-row visible; Safari uses a native picker; mobile browsers
 * use the platform's multi-pick selector.
 */
export const multiSelectEditor: BcCellEditor<unknown, unknown> = {
  Component: MultiSelectEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "multi-select",
}

const DEFAULT_VISIBLE_ROWS = 5

function MultiSelectEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, column, row } = props
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const errorId = useId()

  useEffect(() => {
    if (focusRef && selectRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = selectRef.current
    }
  }, [focusRef])

  useLayoutEffect(() => {
    selectRef.current?.focus({ preventScroll: true })
  }, [])

  void seedKey

  const optionsSource = (column as { options?: unknown }).options
  const options = resolveOptions(optionsSource, row)
  const initialArray = toReadonlyArray(initialValue)
  const initialKeys = new Set(initialArray.map(optionToString))
  const selectOptionValues = options.map((option) => option.value)

  useEffect(() => {
    if (selectRef.current) {
      ;(selectRef.current as BcGridSelectElement)[bcGridSelectOptionValuesKey] = selectOptionValues
    }
  }, [selectOptionValues])

  const visibleRows = Math.max(2, Math.min(DEFAULT_VISIBLE_ROWS, options.length || 2))
  const accessibleName = editorAccessibleName(column, "Select values")

  return (
    <>
      <select
        ref={selectRef}
        className={editorInputClassName}
        multiple
        size={visibleRows}
        defaultValue={options
          .filter((option) => initialKeys.has(optionToString(option.value)))
          .map((option) => optionToString(option.value))}
        disabled={pending}
        aria-invalid={error ? true : undefined}
        aria-label={accessibleName}
        aria-describedby={error ? errorId : undefined}
        aria-busy={pending ? true : undefined}
        data-bc-grid-editor-input="true"
        data-bc-grid-editor-kind="multi-select"
        data-bc-grid-editor-state={editorControlState({ error, pending })}
        data-bc-grid-editor-disabled={pending ? "true" : undefined}
      >
        {options.map((option) => (
          <option key={optionToString(option.value)} value={optionToString(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <span id={errorId} style={visuallyHiddenStyle}>
          {error}
        </span>
      ) : null}
    </>
  )
}

function resolveOptions(
  source: unknown,
  row: unknown,
): readonly { value: unknown; label: string }[] {
  if (Array.isArray(source)) return source as { value: unknown; label: string }[]
  if (typeof source === "function") {
    try {
      const resolved = (source as (row: unknown) => unknown)(row)
      if (Array.isArray(resolved)) return resolved as { value: unknown; label: string }[]
    } catch {
      // Bad option-fn — render no options rather than crashing the cell.
    }
  }
  return []
}

function toReadonlyArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value
  return []
}

function optionToString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}
