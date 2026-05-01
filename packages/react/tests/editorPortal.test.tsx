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
    expect(error).toContain('data-bc-grid-editor-state="error"')
  })

  test("pending wins over error on the data-state attribute (async commit in flight, prior validation error stale)", () => {
    // Per editing-rfc: async commit pending implies the consumer hook
    // is in flight, so the visible state should read as pending until
    // it settles — even if a prior validation error is still attached
    // to the entry. Theming layer keys the spinner / disabled chrome
    // off the data-state attribute, so the precedence has to be pinned
    // here.
    const html = renderDefaultEditor({ pending: true, error: "Required" })

    expect(html).toContain('data-bc-grid-editor-state="pending"')
    expect(html).not.toContain('data-bc-grid-editor-state="error"')
    // disabled while pending — keeps Enter / Tab from re-firing the
    // commit pipeline before the consumer hook resolves.
    expect(html).toContain("disabled")
    // aria-invalid still reflects the error so AT users hear the
    // validation message even mid-pending.
    expect(html).toContain('aria-invalid="true"')
  })

  test("idle state has no disabled attribute and no aria-invalid", () => {
    // Negative pin so a regression that keeps the input disabled after
    // the commit settles gets caught.
    const html = renderDefaultEditor()

    expect(html).not.toContain("disabled")
    expect(html).not.toContain("aria-invalid")
  })

  test("seedKey replaces the initial value (printable activation seeds the user's first keystroke)", () => {
    // Per editing-rfc §Activation: when the editor is opened by typing
    // a printable character, that character replaces the cell's prior
    // value. The default editor reads `defaultValue={seedKey ?? initialValue}`
    // so this is observable in SSR markup.
    const html = renderDefaultEditor({ initialValue: "Acme", seedKey: "x" })

    expect(html).toContain('value="x"')
    expect(html).not.toContain('value="Acme"')
  })

  test("missing initialValue + missing seedKey renders an empty input (no `null` / `undefined` strings)", () => {
    // Defensive — a regression where `String(initialValue)` coerces
    // null to "null" would land here.
    const html = renderDefaultEditor({ initialValue: undefined })

    expect(html).toContain('value=""')
    expect(html).not.toContain('value="undefined"')
    expect(html).not.toContain('value="null"')
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
