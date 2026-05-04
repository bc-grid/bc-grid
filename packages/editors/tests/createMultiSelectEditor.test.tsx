import { describe, expect, test } from "bun:test"
import type { ComponentType } from "react"
import {
  type MultiSelectEditorOptionProps,
  type MultiSelectEditorOptions,
  type MultiSelectEditorTriggerProps,
  createMultiSelectEditor,
  multiSelectEditor,
} from "../src/multiSelect"

/**
 * Tests for `createMultiSelectEditor` factory + slot pattern (v0.6 §1
 * `v06-shadcn-native-editors-select-batch`).
 *
 * Mirrors `createSelectEditor.test.tsx`. Multi-mode adds `isMulti=true`
 * to the option props + chip rendering on the trigger; the slot
 * contract is the same shape via the shared `Combobox` primitive.
 */

describe("createMultiSelectEditor — factory contract", () => {
  test("default-export multiSelectEditor is createMultiSelectEditor()", () => {
    const fresh = createMultiSelectEditor()
    expect(fresh.kind).toBe("multi-select")
    expect(fresh.popup).toBe(true)
    expect(typeof fresh.Component).toBe("function")
    expect(multiSelectEditor.kind).toBe("multi-select")
    expect(multiSelectEditor.popup).toBe(true)
    expect(typeof multiSelectEditor.Component).toBe("function")
  })

  test("createMultiSelectEditor accepts triggerComponent + optionItemComponent", () => {
    const opts: MultiSelectEditorOptions = {
      triggerComponent: () => null,
      optionItemComponent: () => null,
    }
    const editor = createMultiSelectEditor(opts)
    expect(editor.kind).toBe("multi-select")
  })

  test("triggerComponent props expose aria-multiselectable for multi mode", () => {
    type _AriaMulti = MultiSelectEditorTriggerProps["aria-multiselectable"]
    type _DataAttr = MultiSelectEditorTriggerProps["data-bc-grid-editor-input"]
    type _OnKeyDown = MultiSelectEditorTriggerProps["onKeyDown"]
    type _Children = MultiSelectEditorTriggerProps["children"]
    expect(true).toBe(true)
  })

  test("optionItemComponent props expose isMulti + isSelected for chip render", () => {
    // Multi-mode renders a check column + selected chip on the
    // trigger. Pin the `isMulti` + `isSelected` props as REQUIRED
    // so consumers' optionItemComponent can render the multi-mode
    // chrome without spreading `{children}`.
    type _IsMulti = MultiSelectEditorOptionProps["isMulti"]
    type _IsSelected = MultiSelectEditorOptionProps["isSelected"]
    type _AriaSelected = MultiSelectEditorOptionProps["aria-selected"]
    type _DataSelected = MultiSelectEditorOptionProps["data-selected"]
    type _OnPointerDown = MultiSelectEditorOptionProps["onPointerDown"]
    expect(true).toBe(true)
  })

  test("shadcn-style triggerComponent compiles against MultiSelectEditorTriggerProps", () => {
    const ShadcnLikeButton: ComponentType<MultiSelectEditorTriggerProps> = (props) => {
      void props
      return null
    }
    const editor = createMultiSelectEditor({ triggerComponent: ShadcnLikeButton })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createMultiSelectEditor calls return independent editor instances", () => {
    const a = createMultiSelectEditor()
    const b = createMultiSelectEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("multi-select")
    expect(b.kind).toBe("multi-select")
  })
})
