import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react"

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
 *   - F2 / Enter / printable activation: focuses the select. Browsers
 *     vary on whether Space opens the dropdown immediately; the editor
 *     stays out of the way and lets browser-native behaviour drive.
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
  const { initialValue, error, focusRef, seedKey, pending, column, row } = props
  const selectRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    if (focusRef && selectRef.current) {
      ;(focusRef as { current: HTMLElement | null }).current = selectRef.current
    }
  }, [focusRef])

  // Focus on mount; the framework's portal expects this.
  useLayoutEffect(() => {
    selectRef.current?.focus({ preventScroll: true })
  }, [])

  // seedKey is ignored — native select doesn't accept text seeds; users
  // can press a letter to jump to matching options once focused (browser
  // native behaviour).
  void seedKey

  // Resolve options: flat array OR row-fn. Falls back to an empty list
  // so the editor still renders (with no choices) if a column forgot to
  // supply options.
  const optionsSource = (column as { options?: unknown }).options
  const options = resolveOptions(optionsSource, row)
  const initialString = optionToString(initialValue)
  const hasInitialOption = options.some((option) => optionToString(option.value) === initialString)
  const selectOptionValues = hasInitialOption
    ? options.map((option) => option.value)
    : [undefined, ...options.map((option) => option.value)]

  useEffect(() => {
    if (selectRef.current) {
      ;(selectRef.current as BcGridSelectElement)[bcGridSelectOptionValuesKey] = selectOptionValues
    }
  }, [selectOptionValues])

  return (
    <select
      ref={selectRef}
      defaultValue={hasInitialOption ? initialString : ""}
      disabled={pending}
      aria-invalid={error ? true : undefined}
      data-bc-grid-editor-input="true"
      data-bc-grid-editor-kind="select"
      style={selectStyle}
    >
      {!hasInitialOption ? (
        <option value="" disabled hidden>
          Select...
        </option>
      ) : null}
      {options.map((option) => (
        <option key={optionToString(option.value)} value={optionToString(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
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

/**
 * `<option value="...">` requires a string. Coerce the typed value
 * for the DOM attr; the framework's commit path uses the matching
 * option's `.value` (the typed value), not this string.
 */
function optionToString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

const selectStyle: CSSProperties = {
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
  appearance: "auto",
}
