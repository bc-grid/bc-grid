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
 * `optionItemComponent` render-prop slots (v0.7 PR-C3 —
 * `v07-shadcn-editor-render-prop-slots`).
 *
 * The slots let consumers swap the cmdk-backed shadcn Combobox's
 * default trigger button + per-option chrome for shadcn `<Button>` /
 * `<CommandItem>` (or any other forwardRef-capable primitive). The
 * editor keeps the lifecycle (focus, ref, ARIA, listbox state, typed
 * value plumbing); the consumer just owns the visual SHELL.
 *
 * Behavioural verification (DOM-mounted + cmdk integration) is
 * covered by Playwright at the coordinator's CI run.
 */

describe("createSelectEditor — factory contract", () => {
  test("default-export selectEditor is createSelectEditor()", () => {
    const fresh = createSelectEditor()
    expect(fresh.kind).toBe("select")
    expect(fresh.popup).toBe(true)
    expect(typeof fresh.Component).toBe("function")
    expect(typeof fresh.getValue).toBe("function")
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

  test("triggerComponent props include load-bearing data attrs + ARIA + state", () => {
    type _DataAttr = SelectEditorTriggerProps["data-bc-grid-editor-input"]
    type _DataKind = SelectEditorTriggerProps["data-bc-grid-editor-kind"]
    type _AriaMulti = SelectEditorTriggerProps["aria-multiselectable"]
    type _Open = SelectEditorTriggerProps["open"]
    type _IsMulti = SelectEditorTriggerProps["isMulti"]
    type _TagName = SelectEditorTriggerProps["tagName"]
    type _Children = SelectEditorTriggerProps["children"]
    expect(true).toBe(true)
  })

  test("optionItemComponent props expose option + isActive + isSelected + isMulti + children", () => {
    type _Option = SelectEditorOptionProps["option"]
    type _IsActive = SelectEditorOptionProps["isActive"]
    type _IsSelected = SelectEditorOptionProps["isSelected"]
    type _IsMulti = SelectEditorOptionProps["isMulti"]
    type _Children = SelectEditorOptionProps["children"]
    expect(true).toBe(true)
  })

  test("shadcn-style triggerComponent compiles against SelectEditorTriggerProps", () => {
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
