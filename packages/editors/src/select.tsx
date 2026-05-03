import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback, useState } from "react"
import { type EditorOption, editorAccessibleName, resolveEditorOptions } from "./chrome"
import { Combobox } from "./internal/combobox"

interface SelectPrepareResult {
  initialOptions: readonly EditorOption[]
}

type SelectFetchOptions = (query: string, signal: AbortSignal) => Promise<readonly EditorOption[]>

/**
 * Select editor — `kind: "select"`. Default for enum / one-of-many
 * columns per `editing-rfc §editor-select`.
 *
 * **Mount mode:** popup (`popup: true` per
 * `in-cell-editor-mode-rfc.md` §4 — the dropdown listbox overflows
 * the cell box). The Combobox primitive's `<button>` trigger fits
 * the cell, but the listbox container floats below and routinely
 * exceeds the cell's height. The framework mounts this editor via
 * `<EditorPortal>` in the overlay sibling so the listbox can paint
 * above adjacent rows without being clipped by the cell's
 * `overflow: hidden`.
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
  popup: true,
  // First-page preload via `column.fetchOptions("", signal)` so the
  // dropdown paints with async-loaded options on first frame instead
  // of the consumer having to choose between the autocomplete editor
  // (free-text + popup) and rolling a custom `cellEditor`. Mirrors
  // the autocomplete editor's prepare hook (#403). When the column
  // has no `fetchOptions`, the prepare resolves `undefined` and the
  // Component falls through to the synchronous `column.options` path.
  // Per `v06-prepareresult-preload-select-multi` (planning doc §3).
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
  // `prepareResult.initialOptions` from the prepare hook above wins
  // when `column.fetchOptions` is wired; falls through to
  // `resolveEditorOptions(column.options, row)` for the synchronous
  // path so consumers using static `column.options` see no change.
  const initialOptions = (prepareResult as SelectPrepareResult | undefined)?.initialOptions
  const options = initialOptions ?? resolveEditorOptions(optionsSource, row)
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
