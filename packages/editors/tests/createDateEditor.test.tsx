import { describe, expect, test } from "bun:test"
import { type ComponentType, forwardRef } from "react"
import {
  type DateEditorInputProps,
  type DateEditorOptions,
  createDateEditor,
  dateEditor,
} from "../src/date"

/**
 * Tests for `createDateEditor` factory + `inputComponent` render-prop
 * slot (v0.6 §1 `v06-shadcn-native-editors-numeric-batch`).
 *
 * Mirrors `createNumberEditor.test.tsx`. The dateEditor inputComponent
 * receives `type="date"` so the browser still owns the calendar
 * popover; the consumer's primitive only swaps the visual chrome.
 */

describe("createDateEditor — factory contract", () => {
  test("default-export dateEditor is createDateEditor()", () => {
    const fresh = createDateEditor()
    expect(fresh.kind).toBe("date")
    expect(typeof fresh.Component).toBe("function")
    expect(dateEditor.kind).toBe("date")
    expect(typeof dateEditor.Component).toBe("function")
  })

  test("createDateEditor accepts an inputComponent option", () => {
    const opts: DateEditorOptions = {
      inputComponent: () => null,
    }
    const editor = createDateEditor(opts)
    expect(editor.kind).toBe("date")
  })

  test("inputComponent receives the load-bearing data attributes + onPaste", () => {
    // Spread contract: the framework's commit path locates the
    // active input via `data-bc-grid-editor-input`. onPaste is wired
    // for ISO normalisation of locale dates ("5/4/2026" → "2026-05-04")
    // and must flow through the consumer's wrapper.
    type _DataAttr = DateEditorInputProps["data-bc-grid-editor-input"]
    type _DataKind = DateEditorInputProps["data-bc-grid-editor-kind"]
    type _OnPaste = DateEditorInputProps["onPaste"]
    expect(true).toBe(true)
  })

  test("forwardRef shadcn-style component compiles against DateEditorInputProps", () => {
    const ShadcnLikeInput: ComponentType<DateEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<DateEditorInputProps, "ref">
    >((_props, _ref) => {
      return null
    }) as unknown as ComponentType<DateEditorInputProps>

    const editor = createDateEditor({ inputComponent: ShadcnLikeInput })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createDateEditor calls return independent editor instances", () => {
    const a = createDateEditor()
    const b = createDateEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("date")
    expect(b.kind).toBe("date")
  })
})
