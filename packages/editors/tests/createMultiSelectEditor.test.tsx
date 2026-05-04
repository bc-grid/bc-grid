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
 * Tests for `createMultiSelectEditor` factory + slot pattern (v0.7 PR-C3).
 */

describe("createMultiSelectEditor — factory contract", () => {
  test("default-export multiSelectEditor is createMultiSelectEditor()", () => {
    const fresh = createMultiSelectEditor()
    expect(fresh.kind).toBe("multi-select")
    expect(fresh.popup).toBe(true)
    expect(typeof fresh.Component).toBe("function")
    expect(typeof fresh.getValue).toBe("function")
    expect(multiSelectEditor.kind).toBe("multi-select")
    expect(multiSelectEditor.popup).toBe(true)
  })

  test("createMultiSelectEditor accepts triggerComponent + optionItemComponent", () => {
    const opts: MultiSelectEditorOptions = {
      triggerComponent: () => null,
      optionItemComponent: () => null,
    }
    const editor = createMultiSelectEditor(opts)
    expect(editor.kind).toBe("multi-select")
  })

  test("optionItemComponent props expose isMulti=true semantics", () => {
    type _IsMulti = MultiSelectEditorOptionProps["isMulti"]
    type _IsSelected = MultiSelectEditorOptionProps["isSelected"]
    type _Option = MultiSelectEditorOptionProps["option"]
    type _Children = MultiSelectEditorOptionProps["children"]
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
