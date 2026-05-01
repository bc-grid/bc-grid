import { describe, expect, test } from "bun:test"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { EditorPortal, defaultTextEditor, readEditorInputValue } from "../src/editorPortal"
import type { ResolvedColumn } from "../src/gridInternals"
import type { EditingController } from "../src/useEditingController"

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

  test("uses a framework validation id instead of duplicating hidden error text", () => {
    const html = renderDefaultEditor({
      error: "Required",
      validationMessageId: "bc-editor-validation-name",
    })

    expect(html).toContain('aria-describedby="bc-editor-validation-name"')
    expect(html).not.toContain(">Required</span>")
  })
})

describe("EditorPortal validation surface", () => {
  test("renders visible validation text and points the editor input at it", () => {
    const html = renderPortalWithValidationError()
    const messageId = html.match(/id="([^"]+)" class="bc-grid-editor-validation"/)?.[1]

    expect(messageId).toBeDefined()
    expect(html).toContain('data-bc-grid-editor-state="error"')
    expect(html).toContain('data-bc-grid-editor-validation="true"')
    expect(html).toContain(">Required</div>")
    expect(html).toContain(`aria-describedby="${messageId}"`)
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
      multiple: false,
      selectedIndex: 1,
      value: "closed",
      __bcGridSelectOptionValues: ["open", 3],
    } as unknown as HTMLElement

    expect(readEditorInputValue(select)).toBe(3)
  })

  test("reads multi-select typed option arrays without running valueParser", () => {
    const select = {
      tagName: "SELECT",
      multiple: true,
      selectedOptions: [
        { index: 0, value: "open" },
        { index: 2, value: "escalated" },
      ],
      __bcGridSelectOptionValues: ["open", "closed", 3],
    } as unknown as HTMLElement

    expect(readEditorInputValue(select)).toEqual(["open", 3])
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

interface Row {
  id: string
  name: string
}

function renderPortalWithValidationError(): string {
  const controller = {
    editState: { mode: "editing", error: "Required" },
    commit: () => Promise.resolve(),
    cancel: () => {},
    dispatchMounted: () => {},
    dispatchUnmounted: () => {},
    getOverlayValue: () => undefined,
  } as unknown as EditingController<Row>
  const resolvedColumns: ResolvedColumn<Row>[] = [
    {
      source: { field: "name", header: "Name" },
      columnId: "name",
      left: 0,
      width: 120,
      align: "left",
      pinned: null,
      position: 0,
    },
  ]

  return renderToStaticMarkup(
    <EditorPortal
      controller={controller}
      activeCell={{ rowId: "row-1", columnId: "name" }}
      rowEntries={[{ kind: "data", row: { id: "row-1", name: "" }, rowId: "row-1", index: 0 }]}
      resolvedColumns={resolvedColumns}
      cellRect={{ top: 4, left: 8, width: 120, height: 32 }}
      defaultEditor={defaultTextEditor}
    />,
  )
}
