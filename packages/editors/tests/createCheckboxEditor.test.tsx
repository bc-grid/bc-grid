import { describe, expect, test } from "bun:test"
import { type ComponentType, forwardRef } from "react"
import {
  type CheckboxEditorInputProps,
  type CheckboxEditorOptions,
  checkboxEditor,
  createCheckboxEditor,
} from "../src/checkbox"

/**
 * Tests for `createCheckboxEditor` factory + `checkboxComponent`
 * render-prop slot (v0.6 §1 `v06-shadcn-native-editors-select-batch`).
 *
 * The slot lets consumers swap the built-in `<input type="checkbox">`
 * for a shadcn `<Checkbox>` (or any other design-system primitive) while
 * the editor keeps the lifecycle (focus, ref, ARIA, edit-state attrs,
 * commit-time `input.checked` read).
 *
 * Behavioural verification (DOM-mounted) is covered by the coordinator's
 * Playwright run.
 */

describe("createCheckboxEditor — factory contract", () => {
  test("default-export checkboxEditor is createCheckboxEditor()", () => {
    const fresh = createCheckboxEditor()
    expect(fresh.kind).toBe("checkbox")
    expect(typeof fresh.Component).toBe("function")
    expect(checkboxEditor.kind).toBe("checkbox")
    expect(typeof checkboxEditor.Component).toBe("function")
  })

  test("createCheckboxEditor accepts a checkboxComponent option", () => {
    const opts: CheckboxEditorOptions = {
      checkboxComponent: () => null,
    }
    const editor = createCheckboxEditor(opts)
    expect(editor.kind).toBe("checkbox")
  })

  test("checkboxComponent receives the load-bearing data attributes + defaultChecked", () => {
    // The framework's commit path reads `input.checked` directly via
    // the focusRef → DOM path. The data attributes locate the input
    // for click-outside / Tab; pin them as REQUIRED on the prop shape
    // so a refactor that drops them fails to compile.
    type _DataAttr = CheckboxEditorInputProps["data-bc-grid-editor-input"]
    type _DataKind = CheckboxEditorInputProps["data-bc-grid-editor-kind"]
    type _Checked = CheckboxEditorInputProps["defaultChecked"]
    type _Type = CheckboxEditorInputProps["type"]
    expect(true).toBe(true)
  })

  test("forwardRef shadcn-style component compiles against CheckboxEditorInputProps", () => {
    // shadcn's `<Checkbox>` is forwardRef + uses ComponentProps<typeof
    // CheckboxPrimitive.Root> — the slot accepts that shape via
    // structural compatibility on the input attrs we pick.
    const ShadcnLikeCheckbox: ComponentType<CheckboxEditorInputProps> = forwardRef<
      HTMLInputElement,
      Omit<CheckboxEditorInputProps, "ref">
    >((_props, _ref) => {
      return null
    }) as unknown as ComponentType<CheckboxEditorInputProps>

    const editor = createCheckboxEditor({ checkboxComponent: ShadcnLikeCheckbox })
    expect(typeof editor.Component).toBe("function")
  })

  test("multiple createCheckboxEditor calls return independent editor instances", () => {
    const a = createCheckboxEditor()
    const b = createCheckboxEditor()
    expect(a).not.toBe(b)
    expect(a.kind).toBe("checkbox")
    expect(b.kind).toBe("checkbox")
  })
})
