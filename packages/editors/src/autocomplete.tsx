import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback } from "react"
import { type EditorOption, editorAccessibleName } from "./chrome"
import { SearchCombobox, type SearchComboboxFetchOptions } from "./internal/combobox-search"

interface AutocompletePrepareResult {
  initialOptions: readonly EditorOption[]
}

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
 * Audit P1-W3-2 (prepareResult preload) is wired in v0.5: the
 * editor's `prepare` hook calls `column.fetchOptions("", signal)` to
 * preload the first page of options. The dropdown paints with these
 * on first frame instead of the silent "blank dropdown until you
 * type" v0.1 / v0.4 behaviour. If `fetchOptions` is unset (or
 * rejects), the editor still mounts via the graceful prepare-rejection
 * path and falls through to first-keystroke fetch.
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
  // First-page preload via `column.fetchOptions("", signal)` so the
  // dropdown paints with options on first frame. The framework's
  // prepare path is race-safe (a token guards a stale resolve), but
  // it does not pass an AbortSignal — the controller token suppresses
  // the late dispatch instead. v0.6 follow-up: thread an AbortSignal
  // through `BcCellEditorPrepareParams` so superseded preloads can
  // cancel their network request as well.
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
    // The Combobox replaces the input with the option label — the
    // editor portal wrapper reads the input value at commit time.
    // No additional plumbing needed here.
  }, [])

  // `prepareResult` is the resolved value from `autocompleteEditor.prepare`.
  // When the consumer's column had no `fetchOptions` (or prepare rejected
  // and the framework's graceful-degradation path mounted us with no
  // result), `prepareResult` is `undefined` and SearchCombobox falls
  // through to its first-paint fetch via `fetchOptions`.
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
// import it from "@bc-grid/editors" stay green. (Internal API; lives
// in `combobox-search.ts` now.)
export {
  type SearchComboboxFetchOptions as AutocompleteFetchOptions,
  type SearchComboboxRequestController as AutocompleteRequestController,
  createSearchComboboxRequestController as createAutocompleteRequestController,
} from "./internal/combobox-search"
