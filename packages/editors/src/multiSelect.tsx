import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback, useState } from "react"
import { type EditorOption, editorAccessibleName, resolveEditorOptions } from "./chrome"
import { Combobox } from "./internal/combobox"

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
 * **Mount mode:** popup (`popup: true` per
 * `in-cell-editor-mode-rfc.md` §4 — both the dropdown listbox AND
 * the chip lane on the trigger overflow the cell box). The
 * Combobox in multi-mode renders a chip per selected option, which
 * for ERP many-of-many columns (tags, categories, regions) routinely
 * overflows the trigger's width even before the dropdown opens. The
 * framework mounts this editor via `<EditorPortal>` in the overlay
 * sibling so chips wrap freely and the listbox can paint above
 * adjacent rows without `overflow: hidden` clipping.
 *
 * v0.5 (audit P0-4 / synthesis P0-4): replaces the v0.1 native
 * `<select multiple>` shell with the shadcn-native Combobox primitive
 * in `mode: "multi"`. Each option toggles on click; the trigger
 * renders selected chips with optional 16×16 swatches; a checkmark
 * column in the listbox shows the current selection. The listbox is
 * marked `data-bc-grid-editor-portal` so the editor portal's
 * click-outside handler doesn't dismiss it on option clicks.
 *
 * Behaviour:
 *   - Option resolution: `column.options` — flat array of
 *     `{ value, label, swatch?, icon? }` or a row-fn returning the same
 *     shape. Per-row options are still supported per the RFC.
 *   - `initialValue: readonly TValue[]` — every value present in the
 *     array is shown as a selected chip. Values not present in the
 *     options list are silently dropped (consistent with v0.1).
 *   - F2 / Enter / printable activation: opens the dropdown; printable
 *     seeds prefix-navigate to the matching option without
 *     auto-toggling — Space toggles. Mirrors shadcn Combobox in
 *     multi-mode and is the right tradeoff vs single-mode's
 *     auto-select-on-key (which would surprise users in multi).
 *   - Commit produces `readonly TValue[]` — typed values, in option
 *     order. Bypasses `column.valueParser` like the v0.1 multi-select.
 */
export const multiSelectEditor: BcCellEditor<unknown, unknown> = {
  Component: MultiSelectEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "multi-select",
  popup: true,
  // Same async-loaded options path as `selectEditor` (mirrors the
  // autocomplete editor's prepare hook from #403). When the column
  // has no `fetchOptions`, prepare resolves `undefined` and the
  // Component falls through to the synchronous `column.options` path.
  // Per `v06-prepareresult-preload-select-multi` (planning doc §3).
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
  // `prepareResult.initialOptions` from the prepare hook above wins
  // when `column.fetchOptions` is wired; falls through to
  // `resolveEditorOptions(column.options, row)` for the static path.
  const initialOptions = (prepareResult as MultiSelectPrepareResult | undefined)?.initialOptions
  const options = initialOptions ?? resolveEditorOptions(optionsSource, row)
  const accessibleName = editorAccessibleName(column, "Select values")

  // Mirror the picked array into local state so the trigger's chip
  // strip + listbox checkmarks update on every toggle. The editor
  // portal wrapper reads the typed array from the trigger button
  // (`__bcGridComboboxValue`) at commit time.
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
