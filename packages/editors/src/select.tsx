import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback, useState } from "react"
import { type EditorOption, editorAccessibleName, resolveEditorOptions } from "./chrome"
import { Combobox, readComboboxValueFromFocusEl } from "./shadcn/Combobox"
import type {
  ComboboxOptionSlotProps,
  ComboboxSlotOptions,
  ComboboxTriggerSlotProps,
} from "./shadcn/comboboxSlots"

interface SelectPrepareResult {
  initialOptions: readonly EditorOption[]
}

type SelectFetchOptions = (query: string, signal: AbortSignal) => Promise<readonly EditorOption[]>

/**
 * Select editor — `kind: "select"`. Default for enum / one-of-many
 * columns per `editing-rfc §editor-select`.
 *
 * **Mount mode:** popup. The dropdown listbox overflows the cell box.
 *
 * v0.7 (PR-C2 + PR-C3 of the shadcn/Radix correction RFC): migrated to
 * the shadcn `cmdk` + Radix Popover foundation at `shadcn/Combobox.tsx`.
 * `createSelectEditor({ triggerComponent, optionItemComponent })`
 * exposes render-prop slots for the trigger button + per-option row.
 *
 * Behaviour:
 *   - Option resolution: `column.options` — flat array of
 *     `{ value, label, swatch?, icon? }` or a row-fn returning the same
 *     shape.
 *   - F2 / Enter / printable activation: opens the dropdown.
 *   - Existing cell value pre-selects the matching option.
 *   - Commit produces the selected option's `value` (typed `TValue`),
 *     bypassing `column.valueParser`.
 */

/**
 * Props handed to a custom `triggerComponent` for the select editor.
 * Re-exports the shared `ComboboxTriggerSlotProps` shape — drops in
 * any forwardRef-capable shadcn `<Button>` (or similar) without
 * modification. Per `v07-shadcn-editor-render-prop-slots` (PR-C3).
 */
export type SelectEditorTriggerProps = ComboboxTriggerSlotProps

/**
 * Props handed to a custom `optionItemComponent` for the select editor.
 * Re-exports the shared `ComboboxOptionSlotProps` shape.
 */
export type SelectEditorOptionProps = ComboboxOptionSlotProps

/** Per-editor factory option shape. */
export type SelectEditorOptions = ComboboxSlotOptions

/**
 * Factory for the select editor. Returns a fresh `BcCellEditor` with
 * the supplied slot options baked in. Default-export `selectEditor`
 * is `createSelectEditor()` for the zero-config case.
 *
 * ```tsx
 * import { Button } from "@/components/ui/button"
 * import { CommandItem } from "@/components/ui/command"
 * import { createSelectEditor } from "@bc-grid/editors"
 *
 * export const shadcnSelectEditor = createSelectEditor({
 *   triggerComponent: ({ children, ...rest }) => <Button {...rest}>{children}</Button>,
 *   optionItemComponent: ({ children, ...rest }) => <CommandItem {...rest}>{children}</CommandItem>,
 * })
 * ```
 */
export function createSelectEditor(
  options: SelectEditorOptions = {},
): BcCellEditor<unknown, unknown> {
  const Component = createSelectEditorComponent(options)
  return {
    Component: Component as unknown as BcCellEditor<unknown, unknown>["Component"],
    kind: "select",
    popup: true,
    getValue: (focusEl) => readComboboxValueFromFocusEl(focusEl),
    async prepare({ column }) {
      const fetchOptions = (column as { fetchOptions?: SelectFetchOptions }).fetchOptions
      if (!fetchOptions) return undefined
      const controller = new AbortController()
      const initialOptions = await fetchOptions("", controller.signal)
      return { initialOptions } satisfies SelectPrepareResult
    },
  }
}

export const selectEditor: BcCellEditor<unknown, unknown> = createSelectEditor()

function createSelectEditorComponent(
  options: SelectEditorOptions,
): (props: BcCellEditorProps<unknown, unknown>) => ReturnType<typeof SelectEditorBody> {
  const { triggerComponent, optionItemComponent } = options
  return function SelectEditor(props) {
    return (
      <SelectEditorBody
        {...props}
        triggerComponent={triggerComponent}
        optionItemComponent={optionItemComponent}
      />
    )
  }
}

function SelectEditorBody(props: BcCellEditorProps<unknown, unknown> & SelectEditorOptions) {
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
    triggerComponent,
    optionItemComponent,
  } = props
  const optionsSource = (column as { options?: unknown }).options
  const initialOptions = (prepareResult as SelectPrepareResult | undefined)?.initialOptions
  const optionList = initialOptions ?? resolveEditorOptions(optionsSource, row)
  const accessibleName = editorAccessibleName(column, "Select value")

  const [_picked, setPicked] = useState<unknown>(undefined)
  const handleSelect = useCallback((next: unknown) => {
    setPicked(next)
  }, [])

  return (
    <Combobox
      options={optionList}
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
      triggerComponent={triggerComponent}
      optionItemComponent={optionItemComponent}
    />
  )
}
