import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback } from "react"
import { editorAccessibleName } from "./chrome"
import { SearchCombobox, type SearchComboboxFetchOptions } from "./internal/combobox-search"

/**
 * Autocomplete editor — `kind: "autocomplete"`. Default for free-form
 * fields with a long candidate list per `editing-rfc §editor-autocomplete`.
 *
 * v0.5 (audit P0-4 / synthesis P0-4): replaces the v0.1 `<input list>`
 * + `<datalist>` shell with the shadcn-native `SearchCombobox`. The
 * `<datalist>` shell was inconsistent across browsers (Safari announced
 * the value not the label; Firefox required label-and-value to differ;
 * mobile rendered as a plain keyboard suggestion strip), and could not
 * render swatches, icons, or visible "Loading…" / "No matches" states.
 * The new primitive renders a controlled popover anchored below the
 * input with full keyboard parity.
 *
 * Audit P1-W3-2 (prepareResult preload) is a deferred follow-up:
 * `BcCellEditorPrepareParams` only exposes `{ row, rowId, columnId }`,
 * not the resolved column with `fetchOptions`, so plumbing the
 * preload requires a small additive change to the prepare contract.
 * Tracked separately so this migration ships clean. In the meantime
 * the SearchCombobox renders a visible "Loading…" row inline on the
 * first-keystroke fetch — already an improvement over the silent
 * v0.1 datalist.
 *
 * Behaviour (preserved from v0.1):
 *   - Free-text input — committed value is whatever's in the input at
 *     commit time. Picking an option replaces the input with the
 *     option's label, so the commit value is the label string.
 *     Consumers wire `column.valueParser` to convert label → typed
 *     value (non-breaking upgrade contract).
 *   - `column.fetchOptions(query, signal)` runs on every keystroke,
 *     debounced 200 ms, with `AbortController` race handling.
 *   - `seedKey`: replaces the input value with the typed character
 *     and fetches with that as the initial query.
 *   - `pending`: disables the input.
 *
 * New in v0.5:
 *   - Visible "Loading…" / "No matches" inline rows in the dropdown.
 *   - Optional `option.swatch` / `option.icon` rendered next to labels
 *     (matches the select / multi-select editors — uniform option shape).
 */
export const autocompleteEditor: BcCellEditor<unknown, unknown> = {
  Component: AutocompleteEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "autocomplete",
}

function AutocompleteEditor(props: BcCellEditorProps<unknown, unknown>) {
  const { initialValue, error, focusRef, seedKey, pending, required, readOnly, disabled, column } =
    props
  const fetchOptions = (column as { fetchOptions?: SearchComboboxFetchOptions }).fetchOptions
  const accessibleName = editorAccessibleName(column, "Autocomplete value")
  const handleSelect = useCallback(() => {
    // The Combobox replaces the input with the option label — the
    // editor portal wrapper reads the input value at commit time.
    // No additional plumbing needed here.
  }, [])

  return (
    <SearchCombobox
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
      fetchOptions={fetchOptions}
      kind="autocomplete"
    />
  )
}

// Re-export the request controller helper so existing tests that
// import it from "@bc-grid/editors" stay green. (Internal API; lives
// in `combobox-search.ts` now.)
export {
  type SearchComboboxFetchOptions as AutocompleteFetchOptions,
  type SearchComboboxRequestController as AutocompleteRequestController,
  createSearchComboboxRequestController as createAutocompleteRequestController,
} from "./internal/combobox-search"
