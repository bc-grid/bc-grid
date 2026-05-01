import { describe, expect, test } from "bun:test"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultTextEditor, readEditorInputValue } from "../src/editorPortal"

describe("default editor chrome", () => {
  test("emits the shared editor input class and state hooks", () => {
    const html = renderDefaultEditor()

    expect(html).toContain('class="bc-grid-editor-input"')
    expect(html).toContain('data-bc-grid-editor-input="true"')
    expect(html).toContain('data-bc-grid-editor-kind="text-default"')
    expect(html).toContain('data-bc-grid-editor-state="idle"')
  })

  test("surfaces pending and error states on the default editor input", () => {
    const pending = renderDefaultEditor({ pending: true })
    const error = renderDefaultEditor({ error: "Required" })

    expect(pending).toContain("disabled")
    expect(pending).toContain('data-bc-grid-editor-state="pending"')
    expect(error).toContain('aria-invalid="true"')
    expect(error).toContain("aria-describedby=")
    expect(error).toContain("Required")
    expect(error).toContain('data-bc-grid-editor-state="error"')
  })

  test("uses column context for the default editor accessible name", () => {
    const html = renderDefaultEditor({
      column: { header: "Trading Name", field: "tradingName", columnId: "tradingName" },
    })

    expect(html).toContain('aria-label="Trading Name"')
  })
})

describe("readEditorInputValue", () => {
  test("reads checkbox checked state as a boolean commit value", () => {
    const checked = {
      tagName: "INPUT",
      type: "checkbox",
      checked: true,
      value: "on",
    } as unknown as HTMLElement
    const unchecked = {
      tagName: "INPUT",
      type: "checkbox",
      checked: false,
      value: "on",
    } as unknown as HTMLElement

    expect(readEditorInputValue(checked)).toBe(true)
    expect(readEditorInputValue(unchecked)).toBe(false)
  })

  test("continues to read non-checkbox inputs by value", () => {
    const input = {
      tagName: "INPUT",
      type: "text",
      value: "Acme",
    } as unknown as HTMLElement

    expect(readEditorInputValue(input)).toBe("Acme")
  })

  test("reads select typed option values without running valueParser", () => {
    const select = {
      tagName: "SELECT",
      selectedIndex: 1,
      value: "2",
      __bcGridSelectOptionValues: ["open", { id: 2, code: "hold" }],
    } as unknown as HTMLElement

    expect(readEditorInputValue(select)).toEqual({ id: 2, code: "hold" })
  })

  test("reads multi-select typed option arrays without running valueParser", () => {
    const multiSelect = {
      tagName: "SELECT",
      multiple: true,
      selectedOptions: [
        { index: 0, value: "open" },
        { index: 2, value: "vip" },
      ],
      __bcGridSelectOptionValues: ["open", "hold", { id: "vip" }],
    } as unknown as HTMLElement

    expect(readEditorInputValue(multiSelect)).toEqual(["open", { id: "vip" }])
  })
})

function renderDefaultEditor(overrides: Record<string, unknown> = {}): string {
  const Component = defaultTextEditor.Component as ComponentType<Record<string, unknown>>
  return renderToStaticMarkup(
    createElement(Component, {
      initialValue: "Acme",
      commit: () => {},
      cancel: () => {},
      ...overrides,
    }),
  )
}
