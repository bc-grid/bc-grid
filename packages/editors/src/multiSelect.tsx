import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback, useState } from "react"
import { type EditorOption, editorAccessibleName, resolveEditorOptions } from "./chrome"
import { Combobox, readComboboxValueFromFocusEl } from "./shadcn/Combobox"

interface MultiSelectPrepareResult {
  initialOptions: readonly EditorOption[]
}

type MultiSelectFetchOptions = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly EditorOption[]>

/**
 * Multi-select editor — `kind: "multi-select"`. Default for
 * many-of-many columns per `editing-rfc §editor-multi-select`.
 *
 * **Mount mode:** popup. Both the dropdown listbox AND the chip lane on
 * the trigger overflow the cell box.
 *
 * v0.7 (per `docs/coordination/v07-pr-c2-design-decisions.md`): migrated
 * from the in-house `internal/combobox.tsx` (`mode: "multi"`) to the
 * shadcn `cmdk` + Radix Popover foundation at `shadcn/Combobox.tsx`.
 * Each option in the listbox now renders an inline shadcn `<Checkbox>`
 * — keyboard-only multi-select toggling works via Tab to the checkbox +
 * Space (Radix Checkbox native handler). cmdk's default Enter is
 * preventDefault'd (per #427) so Enter commits via the editor portal
 * instead of toggling the active option.
 *
 * Behaviour:
 *   - Option resolution: `column.options` — same flat array / row-fn as
 *     `selectEditor`.
 *   - `initialValue: readonly TValue[]` — every value present in the
 *     array is shown as a selected chip on the trigger and a checked
 *     checkbox in the listbox.
 *   - F2 / Enter / printable activation: opens the dropdown; CommandInput
 *     receives focus (the user can type to filter).
 *   - Click on a CommandItem toggles. Tab to a checkbox + Space toggles
 *     (a11y for keyboard-only users). Enter does NOT toggle (#427) —
 *     Enter commits the current set.
 *   - Commit produces `readonly TValue[]` — typed values, in option
 *     order.
 */
export const multiSelectEditor: BcCellEditor<unknown, unknown> = {
  Component: MultiSelectEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "multi-select",
  popup: true,
  // `getValue?` reads the typed selection array from the popover root's
  // `data-bcgrid-combobox-value` (JSON-encoded). focusRef points at
  // CommandInput; the framework's tag-dispatch fallback would return
  // input.value (a search string) — `getValue?` overrides that.
  getValue: (focusEl) => readComboboxValueFromFocusEl(focusEl),
  async prepare({ column }) {
    const fetchOptions = (column as { fetchOptions?: MultiSelectFetchOptions }).fetchOptions
    if (!fetchOptions) return undefined
    const controller = new AbortController()
    const initialOptions = await fetchOptions("", controller.signal)
    return { initialOptions } satisfies MultiSelectPrepareResult
  },
}

function MultiSelectEditor(props: BcCellEditorProps<unknown, unknown>) {
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
    prepareResult,
  } = props
  const optionsSource = (column as { options?: unknown }).options
  const initialOptions = (prepareResult as MultiSelectPrepareResult | undefined)?.initialOptions
  const options = initialOptions ?? resolveEditorOptions(optionsSource, row)
  const accessibleName = editorAccessibleName(column, "Select values")

  // Mirror the picked array into local state so the chip strip updates
  // as the user toggles. Commit reads via `getValue?` from the popover
  // root's `data-bcgrid-combobox-value`.
  const [, setPicked] = useState<readonly unknown[] | undefined>(undefined)
  const handleSelect = useCallback((next: readonly unknown[]) => {
    setPicked(next)
  }, [])

  const initialArray = Array.isArray(initialValue) ? (initialValue as readonly unknown[]) : []

  return (
    <Combobox
      mode="multi"
      options={options}
      initialValue={initialArray}
      seedKey={seedKey}
      error={error}
      pending={pending}
      required={required}
      readOnly={readOnly}
      disabled={disabled}
      accessibleName={accessibleName}
      focusRef={focusRef as { current: HTMLElement | null } | undefined}
      onSelect={handleSelect}
      kind="multi-select"
    />
  )
}
