import { describe, expect, test } from "bun:test"
import { type ComponentType, forwardRef } from "react"
import {
  type TimeEditorInputProps,
  type TimeEditorOptions,
  createTimeEditor,
  timeEditor,
} from "../src/time"

/**
 * Tests for `createTimeEditor` factory + `inputComponent` render-prop
 * slot (v0.6 §1 `v06-shadcn-native-editors-numeric-batch`).
 */

describe("createTimeEditor — factory contract", () => {
  test("default-export timeEditor is createTimeEditor()", () => {
    const fresh = createTimeEditor()
    expect(fresh.kind).toBe("time")
    expect(typeof fresh.Component).toBe("function")
    expect(timeEditor.kind).toBe("time")
    expect(typeof timeEditor.Component).toBe("function")
  })

  test("createTimeEditor accepts an inputComponent option", () => {
    const opts: TimeEditorOptions = {
      inputComponent: () => null,
    }
    const editor = createTimeEditor(opts)
    expect(editor.kind).toBe("time")
  })

  test("inputComponent receives the load-bearing data attributes", () => {
    type _DataAttr = TimeEditorInputProps["data-bc-grid-editor-input"]
    type _DataKind = TimeEditorInputProps["data-bc-grid-editor-kind"]
    expect(true).toBe(true)
  })

  test("forwardRef shadcn-style component compiles against TimeEditorInputProps", () => {
    const ShadcnLikeInput: ComponentType<TimeEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<TimeEditorInputProps, "ref">
    >((_props, _ref) => {
      return null
    }) as unknown as ComponentType<TimeEditorInputProps>

    const editor = createTimeEditor({ inputComponent: ShadcnLikeInput })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createTimeEditor calls return independent editor instances", () => {
    const a = createTimeEditor()
    const b = createTimeEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("time")
    expect(b.kind).toBe("time")
  })
})
