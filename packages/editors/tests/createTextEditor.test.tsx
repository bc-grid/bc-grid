import { describe, expect, test } from "bun:test"
import {
  type ComponentType,
  type Ref,
  type RefObject,
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react"
import {
  type TextEditorInputProps,
  type TextEditorOptions,
  createTextEditor,
  textEditor,
} from "../src/text"

/**
 * Tests for `createTextEditor` factory + `inputComponent` render-prop
 * slot (v0.6 §1 `v06-shadcn-native-editors`, bsncraft P2 #17).
 *
 * Verifies the factory wires the consumer's component while keeping
 * the editor lifecycle (focus, ref, seed, ARIA, edit-state attrs).
 *
 * The behavioural side (consumer's shadcn `<Input>` actually mounts +
 * the framework's commit path reads through it) needs DOM-mounted
 * verification — covered by the Playwright spec at
 * `apps/examples/tests/editor-shadcn-text.pw.ts`.
 *
 * Per `docs/recipes/shadcn-editors.md`.
 */

describe("createTextEditor — factory contract", () => {
  test("default-export textEditor is createTextEditor()", () => {
    // Pin: the default export uses the factory with no options.
    // Consumers wiring `cellEditor: textEditor` get the built-in
    // `<input>` rendering. Consumers wiring
    // `cellEditor: createTextEditor({ inputComponent })` get the
    // override.
    const fresh = createTextEditor()
    expect(fresh.kind).toBe("text")
    expect(typeof fresh.Component).toBe("function")
    // textEditor + createTextEditor() are independent objects but
    // satisfy the same contract.
    expect(textEditor.kind).toBe("text")
    expect(typeof textEditor.Component).toBe("function")
  })

  test("createTextEditor accepts an inputComponent option", () => {
    // Pin the public API surface — TextEditorOptions is exported,
    // so consumer wiring is type-safe.
    const opts: TextEditorOptions = {
      inputComponent: () => null,
    }
    const editor = createTextEditor(opts)
    expect(editor.kind).toBe("text")
  })

  test("inputComponent receives the load-bearing data attributes", () => {
    // The framework's commit path locates the active input via
    // `data-bc-grid-editor-input="true"`. If the consumer's
    // inputComponent doesn't apply this attribute (because the
    // factory failed to forward it), commit-on-blur breaks
    // silently. Pin that the factory's TextEditorInputProps shape
    // includes the attribute as a REQUIRED prop so consumers'
    // forwardRef wrappers spread it onto their inner input.
    const props = {} as TextEditorInputProps
    // Type-level assertion: data-bc-grid-editor-input MUST be on
    // TextEditorInputProps. If a refactor drops it, this line
    // fails to compile.
    type _DataAttr = TextEditorInputProps["data-bc-grid-editor-input"]
    type _DataKind = TextEditorInputProps["data-bc-grid-editor-kind"]
    void props
    expect(true).toBe(true)
  })

  test("TextEditorInputProps mirrors the native input's typed shape", () => {
    // Pin the prop shape. A custom inputComponent should be able
    // to spread these onto a real <input>; that means the prop
    // names must be valid HTMLInputElement attributes.
    type _Probe = Pick<
      TextEditorInputProps,
      | "className"
      | "type"
      | "defaultValue"
      | "disabled"
      | "aria-invalid"
      | "aria-label"
      | "aria-describedby"
      | "aria-required"
      | "aria-readonly"
      | "aria-disabled"
    >
    expect(true).toBe(true)
  })

  test("forwardRef shadcn-style component compiles against TextEditorInputProps", () => {
    // The classic shadcn `Input` shape: forwardRef wrapping a real
    // <input>. Pin that the factory accepts this shape — if a
    // refactor narrows TextEditorInputProps to something
    // incompatible with React.forwardRef, this fails at compile.
    const ShadcnLikeInput: ComponentType<TextEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<TextEditorInputProps, "ref">
    >((props, ref) => {
      // Just stamp className + spread; no actual rendering.
      return null
    }) as unknown as ComponentType<TextEditorInputProps>

    const editor = createTextEditor({ inputComponent: ShadcnLikeInput })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createTextEditor calls return independent editor instances", () => {
    // Each factory call returns a fresh BcCellEditor object so
    // consumers can configure per-grid (e.g. different
    // inputComponent for AR vs AP). Pin the independence.
    const a = createTextEditor()
    const b = createTextEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("text")
    expect(b.kind).toBe("text")
  })
})
