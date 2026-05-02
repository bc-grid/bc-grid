import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback, useState } from "react"
import { editorAccessibleName, resolveEditorOptions } from "./chrome"
import { Combobox } from "./internal/combobox"

/**
 * Select editor — `kind: "select"`. Default for enum / one-of-many
 * columns per `editing-rfc §editor-select`.
 *
 * v0.5 (audit P0-4 / synthesis P0-4): replaces the v0.1 native
 * `<select>` shell with a shadcn-native Combobox primitive that supports
 * 16×16 colour swatch chips, optional icons, type-ahead, and a fully
 * keyboard-driven listbox UX. The Combobox lives inside the editor
 * portal and marks its dropdown with `data-bc-grid-editor-portal` so
 * the portal-aware click-outside handler in `@bc-grid/react` doesn't
 * dismiss it on option clicks.
 *
 * Behaviour:
 *   - Option resolution: `column.options` — flat array of
 *     `{ value, label, swatch?, icon? }` or a row-fn returning the same
 *     shape. Per-row options are still supported per the RFC.
 *   - F2 / Enter / printable activation: opens the dropdown; printable
 *     seeds prefix-match an option.
 *   - Existing cell value pre-selects the matching option.
 *   - Commit produces the selected option's `value` (typed `TValue`),
 *     bypassing `column.valueParser` like the v0.1 select.
 *
 * Fallback if a column needs the old native `<select>` (mobile picker
 * affordance, very long option lists where browser virtualization
 * matters): pass `column.cellEditor: nativeSelectEditor` (not exported
 * yet — file an issue if you need it).
 */
export const selectEditor: BcCellEditor<unknown, unknown> = {
  Component: SelectEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "select",
}

function SelectEditor(props: BcCellEditorProps<unknown, unknown>) {
  const {
    initialValue,
    error,
    focusRef,
    seedKey,
    pending,
    required,
    readOnly,
    disabled,
    column,
    row,
  } = props
  const optionsSource = (column as { options?: unknown }).options
  const options = resolveEditorOptions(optionsSource, row)
  const accessibleName = editorAccessibleName(column, "Select value")

  // Mirror the picked value into local state so the consumer can see
  // the swatch / label update on the trigger before commit. The
  // editor portal wrapper reads the typed value from the trigger
  // button (`__bcGridComboboxValue`) at commit time.
  const [_picked, setPicked] = useState<unknown>(undefined)
  const handleSelect = useCallback((next: unknown) => {
    setPicked(next)
  }, [])

  return (
    <Combobox
      options={options}
      initialValue={initialValue}
      seedKey={seedKey}
      error={error}
      pending={pending}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      accessibleName={accessibleName}
      focusRef={focusRef as { current: HTMLElement | null } | undefined}
      onSelect={handleSelect}
      kind="select"
    />
  )
}
