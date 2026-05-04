import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback, useState } from "react"
import { type EditorOption, editorAccessibleName, resolveEditorOptions } from "./chrome"
import { Combobox, readComboboxValueFromFocusEl } from "./shadcn/Combobox"

interface SelectPrepareResult {
  initialOptions: readonly EditorOption[]
}

type SelectFetchOptions = (query: string, signal: AbortSignal) => Promise<readonly EditorOption[]>

/**
 * Select editor — `kind: "select"`. Default for enum / one-of-many
 * columns per `editing-rfc §editor-select`.
 *
 * **Mount mode:** popup (`popup: true`). The dropdown listbox overflows
 * the cell box; the framework mounts this editor via `<EditorPortal>` in
 * the overlay sibling so the listbox can paint above adjacent rows
 * without being clipped by the cell's `overflow: hidden`.
 *
 * v0.7 (per `docs/coordination/v07-pr-c2-design-decisions.md`): migrated
 * from the in-house `internal/combobox.tsx` to the shadcn `cmdk` + Radix
 * Popover foundation at `shadcn/Combobox.tsx`. focusRef now points at
 * the popover's `<CommandInput>`; the editor's `getValue?` hook reads
 * the typed selection from `data-bcgrid-combobox-value` stamped on the
 * popover content as the user picks options.
 *
 * Behaviour (preserved from v0.5):
 *   - Option resolution: `column.options` — flat array of
 *     `{ value, label, swatch?, icon? }` or a row-fn returning the same
 *     shape.
 *   - F2 / Enter / printable activation: opens the dropdown.
 *   - Existing cell value pre-selects the matching option.
 *   - Commit produces the selected option's `value` (typed `TValue`),
 *     bypassing `column.valueParser` like the v0.1 select.
 */
export const selectEditor: BcCellEditor<unknown, unknown> = {
  Component: SelectEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "select",
  popup: true,
  // `getValue?` reads the typed selection from the popover root's
  // `data-bcgrid-combobox-value` attribute. Per the v0.7 PR-C2 design
  // decision: focusRef points at CommandInput, which means the
  // framework's tag-dispatch fallback (`readEditorInputValue`) would
  // return `input.value` (the search string) — not the typed
  // selection. `getValue?` overrides that.
  getValue: (focusEl) => readComboboxValueFromFocusEl(focusEl),
  // First-page preload via `column.fetchOptions("", signal)` so the
  // dropdown paints with async-loaded options on first frame.
  async prepare({ column }) {
    const fetchOptions = (column as { fetchOptions?: SelectFetchOptions }).fetchOptions
    if (!fetchOptions) return undefined
    const controller = new AbortController()
    const initialOptions = await fetchOptions("", controller.signal)
    return { initialOptions } satisfies SelectPrepareResult
  },
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
    prepareResult,
  } = props
  const optionsSource = (column as { options?: unknown }).options
  const initialOptions = (prepareResult as SelectPrepareResult | undefined)?.initialOptions
  const options = initialOptions ?? resolveEditorOptions(optionsSource, row)
  const accessibleName = editorAccessibleName(column, "Select value")

  // Mirror the picked value into local state so the trigger's swatch /
  // label updates as the user picks. The framework's commit reads via
  // `getValue?` from `data-bcgrid-combobox-value` on the popover root.
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
