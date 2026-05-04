import { describe, expect, test } from "bun:test"
import type { ComponentType } from "react"
import {
  type AutocompleteEditorOptionProps,
  type AutocompleteEditorOptions,
  autocompleteEditor,
  createAutocompleteEditor,
} from "../src/autocomplete"

/**
 * Tests for `createAutocompleteEditor` factory + `optionItemComponent`
 * slot (v0.6 §1 `v06-shadcn-native-editors-select-batch`).
 *
 * The autocomplete trigger is an `<input>` (self-closing, no children),
 * so the trigger slot is intentionally NOT exposed in this PR — a
 * follow-up adds an `inputComponent` slot mirroring the single-input
 * cluster shape from #488. The optionItemComponent slot follows the
 * same children-as-slot pattern as select / multi-select.
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

  test("createAutocompleteEditor accepts an optionItemComponent option", () => {
    const opts: AutocompleteEditorOptions = {
      optionItemComponent: () => null,
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

  test("shadcn-style optionItemComponent compiles against AutocompleteEditorOptionProps", () => {
    const ShadcnLikeOption: ComponentType<AutocompleteEditorOptionProps> = (props) => {
      void props
      return null
    }
    const editor = createAutocompleteEditor({ optionItemComponent: ShadcnLikeOption })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createAutocompleteEditor calls return independent editor instances", () => {
    const a = createAutocompleteEditor()
    const b = createAutocompleteEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("autocomplete")
    expect(b.kind).toBe("autocomplete")
  })

  test("AutocompleteEditorOptions does NOT expose triggerComponent in this PR", () => {
    // Autocomplete trigger slot is deferred (see file JSDoc). Pin
    // the absence so a refactor that sneaks it in needs to also
    // update the recipe + this test.
    const opts: AutocompleteEditorOptions = {}
    // @ts-expect-error — triggerComponent is intentionally not part of AutocompleteEditorOptions
    opts.triggerComponent = () => null
    expect(true).toBe(true)
  })
})
