import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback } from "react"
import { type EditorOption, editorAccessibleName } from "./chrome"
import { SearchCombobox, type SearchComboboxFetchOptions } from "./shadcn/Combobox"

interface AutocompletePrepareResult {
  initialOptions: readonly EditorOption[]
}

/**
 * Autocomplete editor — `kind: "autocomplete"`. Default for free-form
 * fields with a long candidate list per `editing-rfc §editor-autocomplete`.
 *
 * **Mount mode:** popup (the async-option dropdown panel overflows the
 * cell box).
 *
 * v0.7 (per `docs/coordination/v07-pr-c2-design-decisions.md`): migrated
 * from the in-house `internal/combobox-search.tsx` to the shadcn `cmdk`
 * + Radix Popover foundation at `shadcn/Combobox.tsx::SearchCombobox`.
 * The trigger is the input itself (anchored via Radix Popover.Anchor);
 * cmdk's filter is disabled (`shouldFilter={false}`) so the consumer's
 * `column.fetchOptions` drives results.
 *
 * Free-text passthrough: the committed value is whatever's in the input
 * at commit time (string). Picking an option replaces the input with
 * the option's label, so the commit value is the option label.
 * Consumers wire `column.valueParser` to convert label → typed value.
 *
 * No `getValue?` hook needed — the framework's tag-dispatch fallback
 * (`readEditorInputValue`) returns `input.value` for INPUT elements,
 * which is the autocomplete commit value.
 *
 * Behaviour (preserved from v0.5):
 *   - `column.fetchOptions(query, signal)` runs on every keystroke,
 *     debounced 200 ms, with `AbortController` race handling.
 *   - `seedKey`: replaces the input value with the typed character and
 *     fetches with that as the initial query.
 *   - `pending`: disables the input.
 *   - Visible "Loading…" / "No matches" inline rows in the dropdown.
 *   - Optional `option.swatch` / `option.icon` rendered next to labels.
 */
export const autocompleteEditor: BcCellEditor<unknown, unknown> = {
  Component: AutocompleteEditor as unknown as BcCellEditor<unknown, unknown>["Component"],
  kind: "autocomplete",
  popup: true,
  // First-page preload via `column.fetchOptions("", signal)` so the
  // dropdown paints with options on first frame.
  async prepare({ column }) {
    const fetchOptions = (column as { fetchOptions?: SearchComboboxFetchOptions }).fetchOptions
    if (!fetchOptions) return undefined
    const controller = new AbortController()
    const initialOptions = await fetchOptions("", controller.signal)
    return { initialOptions } satisfies AutocompletePrepareResult
  },
}

function AutocompleteEditor(props: BcCellEditorProps<unknown, unknown>) {
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
    prepareResult,
  } = props
  const fetchOptions = (column as { fetchOptions?: SearchComboboxFetchOptions }).fetchOptions
  const accessibleName = editorAccessibleName(column, "Autocomplete value")
  const handleSelect = useCallback(() => {
    // SearchCombobox replaces the input with the option label — the
    // editor portal wrapper reads input.value at commit time.
  }, [])

  const initialOptions = (prepareResult as AutocompletePrepareResult | undefined)?.initialOptions

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
      initialOptions={initialOptions}
      kind="autocomplete"
    />
  )
}

// Re-export the request controller helper so existing tests that
// import it from "@bc-grid/editors" stay green.
export {
  type SearchComboboxFetchOptions as AutocompleteFetchOptions,
  type SearchComboboxRequestController as AutocompleteRequestController,
  createSearchComboboxRequestController as createAutocompleteRequestController,
} from "./shadcn/Combobox"
