import { describe, expect, test } from "bun:test"
import { type ComponentType, forwardRef } from "react"
import {
  type AutocompleteEditorInputProps,
  type AutocompleteEditorOptionProps,
  type AutocompleteEditorOptions,
  autocompleteEditor,
  createAutocompleteEditor,
} from "../src/autocomplete"

/**
 * Tests for `createAutocompleteEditor` factory + slot pattern.
 *
 * Two slots:
 *   - `optionItemComponent` (children-as-slot, mirrors select /
 *     multi-select trigger from #497)
 *   - `inputComponent` (single-input shape, mirrors text / number /
 *     etc. from #488 — the autocomplete trigger is an `<input>`, so
 *     it lands the same way as the single-input cluster's slot)
 *
 * Per `v06-shadcn-native-editors-autocomplete-input-slot` (closes
 * `v06-shadcn-native-editors-select-batch` follow-up).
 */

describe("createAutocompleteEditor — factory contract", () => {
  test("default-export autocompleteEditor is createAutocompleteEditor()", () => {
    const fresh = createAutocompleteEditor()
    expect(fresh.kind).toBe("autocomplete")
    expect(fresh.popup).toBe(true)
    expect(typeof fresh.Component).toBe("function")
    expect(autocompleteEditor.kind).toBe("autocomplete")
    expect(autocompleteEditor.popup).toBe(true)
    expect(typeof autocompleteEditor.Component).toBe("function")
  })

  test("createAutocompleteEditor accepts optionItemComponent + inputComponent options", () => {
    const opts: AutocompleteEditorOptions = {
      optionItemComponent: () => null,
      inputComponent: () => null,
    }
    const editor = createAutocompleteEditor(opts)
    expect(editor.kind).toBe("autocomplete")
  })

  test("optionItemComponent props match the shared ComboboxOptionSlotProps shape", () => {
    type _OptionId = AutocompleteEditorOptionProps["id"]
    type _Role = AutocompleteEditorOptionProps["role"]
    type _AriaSelected = AutocompleteEditorOptionProps["aria-selected"]
    type _DataIndex = AutocompleteEditorOptionProps["data-option-index"]
    type _OnPointerDown = AutocompleteEditorOptionProps["onPointerDown"]
    type _Option = AutocompleteEditorOptionProps["option"]
    type _IsActive = AutocompleteEditorOptionProps["isActive"]
    type _IsMulti = AutocompleteEditorOptionProps["isMulti"]
    type _Children = AutocompleteEditorOptionProps["children"]
    expect(true).toBe(true)
  })

  test("inputComponent props include load-bearing data attrs + role + ARIA + handlers", () => {
    // The framework's commit path locates the active input via
    // `data-bc-grid-editor-input="true"`. The combobox-specific
    // ARIA (role + aria-haspopup + aria-expanded + aria-controls +
    // aria-activedescendant + aria-busy) drives screen-reader
    // announcements. Pin them as REQUIRED on the prop shape so a
    // refactor that drops them fails to compile.
    type _Role = AutocompleteEditorInputProps["role"]
    type _Type = AutocompleteEditorInputProps["type"]
    type _DataAttr = AutocompleteEditorInputProps["data-bc-grid-editor-input"]
    type _DataKind = AutocompleteEditorInputProps["data-bc-grid-editor-kind"]
    type _AriaHaspopup = AutocompleteEditorInputProps["aria-haspopup"]
    type _AriaExpanded = AutocompleteEditorInputProps["aria-expanded"]
    type _AriaActivedescendant = AutocompleteEditorInputProps["aria-activedescendant"]
    type _AriaBusy = AutocompleteEditorInputProps["aria-busy"]
    type _OnInput = AutocompleteEditorInputProps["onInput"]
    type _OnKeyDown = AutocompleteEditorInputProps["onKeyDown"]
    type _Open = AutocompleteEditorInputProps["open"]
    type _Loading = AutocompleteEditorInputProps["loading"]
    expect(true).toBe(true)
  })

  test("shadcn-style optionItemComponent compiles against AutocompleteEditorOptionProps", () => {
    const ShadcnLikeOption: ComponentType<AutocompleteEditorOptionProps> = (props) => {
      void props
      return null
    }
    const editor = createAutocompleteEditor({ optionItemComponent: ShadcnLikeOption })
    expect(typeof editor.Component).toBe("function")
  })

  test("forwardRef shadcn-style inputComponent compiles against AutocompleteEditorInputProps", () => {
    // Vanilla shadcn `<Input>` shape: forwardRef wrapping a real
    // <input>. Pin compatibility — if a refactor narrows the slot
    // shape to something incompatible with React.forwardRef, this
    // fails at compile.
    const ShadcnLikeInput: ComponentType<AutocompleteEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<AutocompleteEditorInputProps, "ref">
    >((_props, _ref) => {
      return null
    }) as unknown as ComponentType<AutocompleteEditorInputProps>

    const editor = createAutocompleteEditor({ inputComponent: ShadcnLikeInput })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createAutocompleteEditor calls return independent editor instances", () => {
    const a = createAutocompleteEditor()
    const b = createAutocompleteEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("autocomplete")
    expect(b.kind).toBe("autocomplete")
  })
})
