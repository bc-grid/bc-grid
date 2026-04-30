import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { type CSSProperties, useEffect, useLayoutEffect, useRef } from "react"

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
 *     current value isn't in the options list, the select renders with
 *     no selection (browsers typically default to the first option's
 *     visual state but preserve the empty internal value).
 *   - Commit produces the selected option's string `value`. Consumers
 *     with non-string domain values can use `column.valueParser` to map
 *     that string back to `TValue` before validation / commit.
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
  const initialString = valueToSelectString(initialValue)
  const hasInitialOption = options.some((option) => option.value === initialString)

  return (
    <select
      ref={selectRef}
      defaultValue={initialString}
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
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function resolveOptions(
  source: unknown,
  row: unknown,
): readonly { value: string; label: string }[] {
  if (Array.isArray(source)) return normaliseOptions(source)
  if (typeof source === "function") {
    try {
      const resolved = (source as (row: unknown) => unknown)(row)
      if (Array.isArray(resolved)) return normaliseOptions(resolved)
    } catch {
      // Bad option-fn — render no options rather than crashing the cell.
    }
  }
  return []
}

function normaliseOptions(source: readonly unknown[]): readonly { value: string; label: string }[] {
  return source.flatMap((option) => {
    if (!option || typeof option !== "object") return []
    const value = (option as { value?: unknown }).value
    const label = (option as { label?: unknown }).label
    if (typeof value !== "string" || typeof label !== "string") return []
    return [{ value, label }]
  })
}

function valueToSelectString(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  return String(value)
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
