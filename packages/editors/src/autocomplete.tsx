import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback } from "react"
import { type EditorOption, editorAccessibleName } from "./chrome"
import { SearchCombobox, type SearchComboboxFetchOptions } from "./shadcn/Combobox"
import type {
  ComboboxOptionSlotProps,
  SearchComboboxInputSlotProps,
  SearchComboboxSlotOptions,
} from "./shadcn/comboboxSlots"

interface AutocompletePrepareResult {
  initialOptions: readonly EditorOption[]
}

/**
 * Autocomplete editor — `kind: "autocomplete"`. Default for free-form
 * fields with a long candidate list per `editing-rfc §editor-autocomplete`.
 *
 * **Mount mode:** popup. The async-option dropdown panel overflows the
 * cell box.
 *
 * v0.7 (PR-C2 + PR-C3): migrated to the shadcn `cmdk` + Radix Popover
 * foundation. The trigger is the input itself (anchored via Radix
 * Popover.Anchor); cmdk's filter is disabled (`shouldFilter={false}`)
 * so the consumer's `column.fetchOptions` drives results.
 * `createAutocompleteEditor({ inputComponent, optionItemComponent })`
 * exposes render-prop slots — input shell mirrors the single-input
 * cluster pattern from #488; option-row matches select / multi-select.
 *
 * Free-text passthrough — the committed value is whatever's in the
 * input at commit time (string).
 */

/**
 * Props handed to a custom `inputComponent` for the autocomplete editor.
 * Re-exports the shared `SearchComboboxInputSlotProps` shape — drops in
 * any forwardRef-capable shadcn `<Input>` (or similar) without
 * modification.
 */
export type AutocompleteEditorInputProps = SearchComboboxInputSlotProps

/**
 * Props handed to a custom `optionItemComponent` for the autocomplete editor.
 */
export type AutocompleteEditorOptionProps = ComboboxOptionSlotProps

export type AutocompleteEditorOptions = SearchComboboxSlotOptions

/**
 * Factory for the autocomplete editor.
 *
 * ```tsx
 * import { Input } from "@/components/ui/input"
 * import { CommandItem } from "@/components/ui/command"
 * import { createAutocompleteEditor } from "@bc-grid/editors"
 *
 * export const shadcnAutocompleteEditor = createAutocompleteEditor({
 *   inputComponent: Input,
 *   optionItemComponent: ({ children, ...rest }) => <CommandItem {...rest}>{children}</CommandItem>,
 * })
 * ```
 */
export function createAutocompleteEditor(
  options: AutocompleteEditorOptions = {},
): BcCellEditor<unknown, unknown> {
  const Component = createAutocompleteEditorComponent(options)
  return {
    Component: Component as unknown as BcCellEditor<unknown, unknown>["Component"],
    kind: "autocomplete",
    popup: true,
    async prepare({ column }) {
      const fetchOptions = (column as { fetchOptions?: SearchComboboxFetchOptions }).fetchOptions
      if (!fetchOptions) return undefined
      const controller = new AbortController()
      const initialOptions = await fetchOptions("", controller.signal)
      return { initialOptions } satisfies AutocompletePrepareResult
    },
  }
}

export const autocompleteEditor: BcCellEditor<unknown, unknown> = createAutocompleteEditor()

function createAutocompleteEditorComponent(
  options: AutocompleteEditorOptions,
): (props: BcCellEditorProps<unknown, unknown>) => ReturnType<typeof AutocompleteEditorBody> {
  const { inputComponent, optionItemComponent } = options
  return function AutocompleteEditor(props) {
    return (
      <AutocompleteEditorBody
        {...props}
        inputComponent={inputComponent}
        optionItemComponent={optionItemComponent}
      />
    )
  }
}

function AutocompleteEditorBody(
  props: BcCellEditorProps<unknown, unknown> & AutocompleteEditorOptions,
) {
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
    inputComponent,
    optionItemComponent,
  } = props
  const fetchOptions = (column as { fetchOptions?: SearchComboboxFetchOptions }).fetchOptions
  const accessibleName = editorAccessibleName(column, "Autocomplete value")
  const handleSelect = useCallback(() => {}, [])

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
      inputComponent={inputComponent}
      optionItemComponent={optionItemComponent}
    />
  )
}

// Re-export the request controller helper for tests.
export {
  type SearchComboboxFetchOptions as AutocompleteFetchOptions,
  type SearchComboboxRequestController as AutocompleteRequestController,
  createSearchComboboxRequestController as createAutocompleteRequestController,
} from "./shadcn/Combobox"
