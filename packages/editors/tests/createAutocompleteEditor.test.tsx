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
 * Tests for `createAutocompleteEditor` factory + slot pattern (v0.7 PR-C3).
 */

describe("createAutocompleteEditor — factory contract", () => {
  test("default-export autocompleteEditor is createAutocompleteEditor()", () => {
    const fresh = createAutocompleteEditor()
    expect(fresh.kind).toBe("autocomplete")
    expect(fresh.popup).toBe(true)
    expect(typeof fresh.Component).toBe("function")
    expect(autocompleteEditor.kind).toBe("autocomplete")
    expect(autocompleteEditor.popup).toBe(true)
  })

  test("createAutocompleteEditor accepts inputComponent + optionItemComponent options", () => {
    const opts: AutocompleteEditorOptions = {
      inputComponent: () => null,
      optionItemComponent: () => null,
    }
    const editor = createAutocompleteEditor(opts)
    expect(editor.kind).toBe("autocomplete")
  })

  test("inputComponent props match SearchComboboxInputSlotProps shape (load-bearing data + ARIA + handlers)", () => {
    type _Role = AutocompleteEditorInputProps["role"]
    type _Type = AutocompleteEditorInputProps["type"]
    type _DataAttr = AutocompleteEditorInputProps["data-bc-grid-editor-input"]
    type _AriaHaspopup = AutocompleteEditorInputProps["aria-haspopup"]
    type _AriaExpanded = AutocompleteEditorInputProps["aria-expanded"]
    type _AriaBusy = AutocompleteEditorInputProps["aria-busy"]
    type _OnInput = AutocompleteEditorInputProps["onInput"]
    type _Open = AutocompleteEditorInputProps["open"]
    type _Loading = AutocompleteEditorInputProps["loading"]
    expect(true).toBe(true)
  })

  test("optionItemComponent props match shared ComboboxOptionSlotProps shape", () => {
    type _Option = AutocompleteEditorOptionProps["option"]
    type _IsActive = AutocompleteEditorOptionProps["isActive"]
    type _IsMulti = AutocompleteEditorOptionProps["isMulti"]
    type _Children = AutocompleteEditorOptionProps["children"]
    expect(true).toBe(true)
  })

  test("forwardRef shadcn-style inputComponent compiles against AutocompleteEditorInputProps", () => {
    const ShadcnLikeInput: ComponentType<AutocompleteEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<AutocompleteEditorInputProps, "ref">
    >((_props, _ref) => null) as unknown as ComponentType<AutocompleteEditorInputProps>

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
