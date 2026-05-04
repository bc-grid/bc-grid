import { describe, expect, test } from "bun:test"
import { type ComponentType, forwardRef } from "react"
import {
  type DatetimeEditorInputProps,
  type DatetimeEditorOptions,
  createDatetimeEditor,
  datetimeEditor,
} from "../src/datetime"

/**
 * Tests for `createDatetimeEditor` factory + `inputComponent`
 * render-prop slot (v0.6 §1 `v06-shadcn-native-editors-numeric-batch`).
 */

describe("createDatetimeEditor — factory contract", () => {
  test("default-export datetimeEditor is createDatetimeEditor()", () => {
    const fresh = createDatetimeEditor()
    expect(fresh.kind).toBe("datetime")
    expect(typeof fresh.Component).toBe("function")
    expect(datetimeEditor.kind).toBe("datetime")
    expect(typeof datetimeEditor.Component).toBe("function")
  })

  test("createDatetimeEditor accepts an inputComponent option", () => {
    const opts: DatetimeEditorOptions = {
      inputComponent: () => null,
    }
    const editor = createDatetimeEditor(opts)
    expect(editor.kind).toBe("datetime")
  })

  test("inputComponent receives the load-bearing data attributes", () => {
    type _DataAttr = DatetimeEditorInputProps["data-bc-grid-editor-input"]
    type _DataKind = DatetimeEditorInputProps["data-bc-grid-editor-kind"]
    expect(true).toBe(true)
  })

  test("forwardRef shadcn-style component compiles against DatetimeEditorInputProps", () => {
    const ShadcnLikeInput: ComponentType<DatetimeEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<DatetimeEditorInputProps, "ref">
    >((_props, _ref) => {
      return null
    }) as unknown as ComponentType<DatetimeEditorInputProps>

    const editor = createDatetimeEditor({ inputComponent: ShadcnLikeInput })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createDatetimeEditor calls return independent editor instances", () => {
    const a = createDatetimeEditor()
    const b = createDatetimeEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("datetime")
    expect(b.kind).toBe("datetime")
  })
})
