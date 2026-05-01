import { describe, expect, test } from "bun:test"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultTextEditor } from "../src/editorPortal"

describe("default editor chrome", () => {
  test("emits the shared editor input class and state hooks", () => {
    const html = renderDefaultEditor()

    expect(html).toContain('class="bc-grid-editor-input"')
    expect(html).toContain('data-bc-grid-editor-input="true"')
    expect(html).toContain('data-bc-grid-editor-kind="text-default"')
    expect(html).toContain('data-bc-grid-editor-state="idle"')
    expect(html).toContain('aria-label="Name"')
  })

  test("surfaces pending and error states on the default editor input", () => {
    const pending = renderDefaultEditor({ pending: true })
    const error = renderDefaultEditor({ error: "Required" })

    expect(pending).toContain("disabled")
    expect(pending).toContain('aria-busy="true"')
    expect(pending).toContain('data-bc-grid-editor-state="pending"')
    expect(pending).toContain('data-bc-grid-editor-disabled="true"')
    expect(error).toContain('aria-invalid="true"')
    expect(error).toContain("aria-describedby=")
    expect(error).toContain('data-bc-grid-editor-state="error"')
    expect(error).toContain("Required")
  })
})

function renderDefaultEditor(overrides: Record<string, unknown> = {}): string {
  const Component = defaultTextEditor.Component as ComponentType<Record<string, unknown>>
  return renderToStaticMarkup(
    createElement(Component, {
      initialValue: "Acme",
      column: { field: "name", header: "Name" },
      commit: () => {},
      cancel: () => {},
      ...overrides,
    }),
  )
}
