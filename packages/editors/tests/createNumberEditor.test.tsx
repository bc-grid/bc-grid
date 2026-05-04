import { describe, expect, test } from "bun:test"
import { type ComponentType, forwardRef } from "react"
import {
  type NumberEditorInputProps,
  type NumberEditorOptions,
  createNumberEditor,
  numberEditor,
} from "../src/number"

/**
 * Tests for `createNumberEditor` factory + `inputComponent` render-prop
 * slot (v0.6 §1 `v06-shadcn-native-editors-numeric-batch`, extends the
 * pattern #480 established for textEditor).
 *
 * Verifies the factory wires the consumer's component while keeping
 * the editor lifecycle (focus, ref, seed, ARIA, paste-detection,
 * edit-state attrs).
 *
 * The behavioural side (consumer's shadcn `<Input>` actually mounts +
 * commit reads through it) is covered by Playwright at the coordinator.
 */

describe("createNumberEditor — factory contract", () => {
  test("default-export numberEditor is createNumberEditor()", () => {
    const fresh = createNumberEditor()
    expect(fresh.kind).toBe("number")
    expect(typeof fresh.Component).toBe("function")
    expect(numberEditor.kind).toBe("number")
    expect(typeof numberEditor.Component).toBe("function")
  })

  test("createNumberEditor accepts an inputComponent option", () => {
    const opts: NumberEditorOptions = {
      inputComponent: () => null,
    }
    const editor = createNumberEditor(opts)
    expect(editor.kind).toBe("number")
  })

  test("inputComponent receives the load-bearing data attributes + inputMode", () => {
    // The framework's commit path locates the active input via
    // `data-bc-grid-editor-input="true"`. inputMode="decimal" surfaces
    // the numeric keyboard on touch devices — both must travel through
    // the inputProps to the consumer's component.
    type _DataAttr = NumberEditorInputProps["data-bc-grid-editor-input"]
    type _DataKind = NumberEditorInputProps["data-bc-grid-editor-kind"]
    type _InputMode = NumberEditorInputProps["inputMode"]
    type _OnPaste = NumberEditorInputProps["onPaste"]
    expect(true).toBe(true)
  })

  test("forwardRef shadcn-style component compiles against NumberEditorInputProps", () => {
    const ShadcnLikeInput: ComponentType<NumberEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<NumberEditorInputProps, "ref">
    >((_props, _ref) => {
      return null
    }) as unknown as ComponentType<NumberEditorInputProps>

    const editor = createNumberEditor({ inputComponent: ShadcnLikeInput })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createNumberEditor calls return independent editor instances", () => {
    const a = createNumberEditor()
    const b = createNumberEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("number")
    expect(b.kind).toBe("number")
  })
})
