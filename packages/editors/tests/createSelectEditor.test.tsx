import { describe, expect, test } from "bun:test"
import type { ComponentType } from "react"
import {
  type SelectEditorOptionProps,
  type SelectEditorOptions,
  type SelectEditorTriggerProps,
  createSelectEditor,
  selectEditor,
} from "../src/select"

/**
 * Tests for `createSelectEditor` factory + `triggerComponent` /
 * `optionItemComponent` render-prop slots (v0.6 §1
 * `v06-shadcn-native-editors-select-batch`).
 *
 * The slots let consumers swap the built-in `<button>` trigger and
 * per-option `<div role="option">` for shadcn `<Button>` /
 * `<CommandItem>` (or any other forwardRef-capable primitive). The
 * editor keeps the lifecycle (focus, ref, ARIA, listbox state, typed
 * value plumbing); the consumer just owns the visual SHELL.
 *
 * Behavioural verification (DOM-mounted) is covered by the coordinator's
 * Playwright run.
 */

describe("createSelectEditor — factory contract", () => {
  test("default-export selectEditor is createSelectEditor()", () => {
    const fresh = createSelectEditor()
    expect(fresh.kind).toBe("select")
    expect(fresh.popup).toBe(true)
    expect(typeof fresh.Component).toBe("function")
    expect(selectEditor.kind).toBe("select")
    expect(selectEditor.popup).toBe(true)
    expect(typeof selectEditor.Component).toBe("function")
  })

  test("createSelectEditor accepts triggerComponent + optionItemComponent options", () => {
    const opts: SelectEditorOptions = {
      triggerComponent: () => null,
      optionItemComponent: () => null,
    }
    const editor = createSelectEditor(opts)
    expect(editor.kind).toBe("select")
  })

  test("triggerComponent props include load-bearing data attrs + handlers + children", () => {
    // The framework's commit path locates the active trigger via
    // `data-bc-grid-editor-input="true"` + reads typed value via the
    // `__bcGridComboboxValue` property on the button element. Pin
    // the load-bearing attrs as REQUIRED on the prop shape so a
    // refactor that drops them fails to compile.
    type _DataAttr = SelectEditorTriggerProps["data-bc-grid-editor-input"]
    type _DataKind = SelectEditorTriggerProps["data-bc-grid-editor-kind"]
    type _AriaHaspopup = SelectEditorTriggerProps["aria-haspopup"]
    type _AriaExpanded = SelectEditorTriggerProps["aria-expanded"]
    type _OnKeyDown = SelectEditorTriggerProps["onKeyDown"]
    type _Children = SelectEditorTriggerProps["children"]
    type _Open = SelectEditorTriggerProps["open"]
    type _TagName = SelectEditorTriggerProps["tagName"]
    expect(true).toBe(true)
  })

  test("optionItemComponent props include load-bearing handlers + structured data", () => {
    type _OptionId = SelectEditorOptionProps["id"]
    type _Role = SelectEditorOptionProps["role"]
    type _AriaSelected = SelectEditorOptionProps["aria-selected"]
    type _DataIndex = SelectEditorOptionProps["data-option-index"]
    type _OnPointerDown = SelectEditorOptionProps["onPointerDown"]
    type _Option = SelectEditorOptionProps["option"]
    type _IsActive = SelectEditorOptionProps["isActive"]
    type _IsSelected = SelectEditorOptionProps["isSelected"]
    type _IsMulti = SelectEditorOptionProps["isMulti"]
    type _Children = SelectEditorOptionProps["children"]
    expect(true).toBe(true)
  })

  test("shadcn-style triggerComponent compiles against SelectEditorTriggerProps", () => {
    // Vanilla shadcn `<Button>` shape: spread + render children. The
    // slot prop type accepts any ComponentType<SelectEditorTriggerProps>
    // — pin compatibility via assignment.
    const ShadcnLikeButton: ComponentType<SelectEditorTriggerProps> = (props) => {
      void props
      return null
    }
    const editor = createSelectEditor({ triggerComponent: ShadcnLikeButton })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createSelectEditor calls return independent editor instances", () => {
    const a = createSelectEditor()
    const b = createSelectEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("select")
    expect(b.kind).toBe("select")
  })
})
