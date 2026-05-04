import type { BcCellEditor, BcCellEditorProps } from "@bc-grid/react"
import { useCallback, useState } from "react"
import { type EditorOption, editorAccessibleName, resolveEditorOptions } from "./chrome"
import { Combobox, readComboboxValueFromFocusEl } from "./shadcn/Combobox"
import type {
  ComboboxOptionSlotProps,
  ComboboxSlotOptions,
  ComboboxTriggerSlotProps,
} from "./shadcn/comboboxSlots"

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
 * **Mount mode:** popup. Both the dropdown listbox AND the chip lane
 * on the trigger overflow the cell box.
 *
 * v0.7 (PR-C2 + PR-C3): each option in the listbox renders an inline
 * shadcn `<Checkbox>` — keyboard-only multi-select toggling works via
 * Tab to the checkbox + Space (Radix Checkbox native handler). cmdk's
 * default Enter is preventDefault'd (per #427) so Enter commits via
 * the editor portal instead of toggling the active option.
 * `createMultiSelectEditor({ triggerComponent, optionItemComponent })`
 * exposes the same render-prop slots as `selectEditor`.
 */

/**
 * Props handed to a custom `triggerComponent` for the multi-select editor.
 */
export type MultiSelectEditorTriggerProps = ComboboxTriggerSlotProps

/**
 * Props handed to a custom `optionItemComponent` for the multi-select editor.
 * `isSelected` reflects the committed selection state (drives the inline
 * Checkbox's `checked` prop).
 */
export type MultiSelectEditorOptionProps = ComboboxOptionSlotProps

export type MultiSelectEditorOptions = ComboboxSlotOptions

/**
 * Factory for the multi-select editor.
 *
 * ```tsx
 * import { Button } from "@/components/ui/button"
 * import { CommandItem } from "@/components/ui/command"
 * import { createMultiSelectEditor } from "@bc-grid/editors"
 *
 * export const shadcnMultiSelectEditor = createMultiSelectEditor({
 *   triggerComponent: ({ children, ...rest }) => <Button {...rest}>{children}</Button>,
 *   optionItemComponent: ({ children, ...rest }) => <CommandItem {...rest}>{children}</CommandItem>,
 * })
 * ```
 */
export function createMultiSelectEditor(
  options: MultiSelectEditorOptions = {},
): BcCellEditor<unknown, unknown> {
  const Component = createMultiSelectEditorComponent(options)
  return {
    Component: Component as unknown as BcCellEditor<unknown, unknown>["Component"],
    kind: "multi-select",
    popup: true,
    getValue: (focusEl) => readComboboxValueFromFocusEl(focusEl),
    async prepare({ column }) {
      const fetchOptions = (column as { fetchOptions?: MultiSelectFetchOptions }).fetchOptions
      if (!fetchOptions) return undefined
      const controller = new AbortController()
      const initialOptions = await fetchOptions("", controller.signal)
      return { initialOptions } satisfies MultiSelectPrepareResult
    },
  }
}

export const multiSelectEditor: BcCellEditor<unknown, unknown> = createMultiSelectEditor()

function createMultiSelectEditorComponent(
  options: MultiSelectEditorOptions,
): (props: BcCellEditorProps<unknown, unknown>) => ReturnType<typeof MultiSelectEditorBody> {
  const { triggerComponent, optionItemComponent } = options
  return function MultiSelectEditor(props) {
    return (
      <MultiSelectEditorBody
        {...props}
        triggerComponent={triggerComponent}
        optionItemComponent={optionItemComponent}
      />
    )
  }
}

function MultiSelectEditorBody(
  props: BcCellEditorProps<unknown, unknown> & MultiSelectEditorOptions,
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
    row,
    prepareResult,
    triggerComponent,
    optionItemComponent,
  } = props
  const optionsSource = (column as { options?: unknown }).options
  const initialOptions = (prepareResult as MultiSelectPrepareResult | undefined)?.initialOptions
  const optionList = initialOptions ?? resolveEditorOptions(optionsSource, row)
  const accessibleName = editorAccessibleName(column, "Select values")

  const [, setPicked] = useState<readonly unknown[] | undefined>(undefined)
  const handleSelect = useCallback((next: readonly unknown[]) => {
    setPicked(next)
  }, [])

  const initialArray = Array.isArray(initialValue) ? (initialValue as readonly unknown[]) : []

  return (
    <Combobox
      mode="multi"
      options={optionList}
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
      triggerComponent={triggerComponent}
      optionItemComponent={optionItemComponent}
    />
  )
}
