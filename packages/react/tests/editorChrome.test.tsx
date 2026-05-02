import { describe, expect, test } from "bun:test"
import {
  autocompleteEditor,
  checkboxEditor,
  dateEditor,
  datetimeEditor,
  multiSelectEditor,
  numberEditor,
  selectEditor,
  textEditor,
  timeEditor,
} from "@bc-grid/editors"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { BcCellEditor } from "../src/types"

const optionColumn = {
  field: "status",
  header: "Status",
  options: [
    { value: "open", label: "Open" },
    { value: "closed", label: "Closed" },
  ],
}

const editorCases: Array<{
  editor: BcCellEditor<unknown, unknown>
  initialValue: unknown
  kind: string
  column?: Record<string, unknown>
}> = [
  { editor: textEditor, initialValue: "Acme", kind: "text" },
  { editor: numberEditor, initialValue: 123, kind: "number" },
  { editor: dateEditor, initialValue: "2026-05-01", kind: "date" },
  { editor: datetimeEditor, initialValue: "2026-05-01T10:30", kind: "datetime" },
  { editor: timeEditor, initialValue: "10:30", kind: "time" },
  { editor: selectEditor, initialValue: "open", kind: "select", column: optionColumn },
  {
    editor: multiSelectEditor,
    initialValue: ["open"],
    kind: "multi-select",
    column: optionColumn,
  },
  {
    editor: autocompleteEditor,
    initialValue: "open",
    kind: "autocomplete",
    column: {
      field: "status",
      header: "Status",
      fetchOptions: async () => optionColumn.options,
    },
  },
  { editor: checkboxEditor, initialValue: true, kind: "checkbox" },
]

describe("built-in editor chrome hooks", () => {
  test("every built-in editor emits the shared class and idle state hooks", () => {
    for (const entry of editorCases) {
      const html = renderEditor(entry)

      expect(html).toContain("bc-grid-editor-input")
      expect(html).toContain('data-bc-grid-editor-input="true"')
      expect(html).toContain(`data-bc-grid-editor-kind="${entry.kind}"`)
      expect(html).toContain('data-bc-grid-editor-state="idle"')
    }
  })

  test("pending state disables the native control and surfaces a pending hook", () => {
    for (const entry of editorCases) {
      const html = renderEditor(entry, { pending: true })

      expect(html).toContain("disabled")
      expect(html).toContain('data-bc-grid-editor-state="pending"')
    }
  })

  test("error state surfaces aria-invalid and an error hook", () => {
    for (const entry of editorCases) {
      const html = renderEditor(entry, { error: "Required" })

      expect(html).toContain('aria-invalid="true"')
      expect(html).toContain('data-bc-grid-editor-state="error"')
    }
  })

  test("lookup-style editors expose accessible names and option-count hooks", () => {
    for (const entry of editorCases.filter((item) =>
      ["select", "multi-select", "autocomplete"].includes(item.kind),
    )) {
      const html = renderEditor(entry)

      expect(html).toContain('aria-label="Status"')
      expect(html).toContain("data-bc-grid-editor-option-count")
    }
  })

  test("lookup-style editor errors are linked through aria-describedby", () => {
    for (const entry of editorCases.filter((item) =>
      ["select", "multi-select", "autocomplete"].includes(item.kind),
    )) {
      const html = renderEditor(entry, { error: "Required" })

      expect(html).toContain("aria-describedby=")
      expect(html).toContain("Required")
    }
  })

  test("select editor marks printable seed matches for native typeahead activation", () => {
    const html = renderEditor(
      { editor: selectEditor, initialValue: "open", column: optionColumn },
      { seedKey: "c" },
    )

    expect(html).toContain('data-bc-grid-editor-seeded="true"')
    expect(html).toContain('data-bc-grid-editor-option-count="2"')
  })

  test("multi-select editor keeps typed options and exposes native listbox hooks", () => {
    const html = renderEditor(
      {
        editor: multiSelectEditor,
        initialValue: ["open"],
        column: optionColumn,
      },
      { seedKey: "c" },
    )

    expect(html).toContain("multiple")
    expect(html).toContain('aria-label="Status"')
    expect(html).toContain('data-bc-grid-editor-kind="multi-select"')
    expect(html).toContain('data-bc-grid-editor-option-count="2"')
  })

  test("autocomplete editor exposes datalist, busy, and live status hooks", () => {
    const html = renderEditor(
      {
        editor: autocompleteEditor,
        initialValue: "open",
        column: {
          field: "status",
          header: "Status",
          fetchOptions: async () => optionColumn.options,
        },
      },
      { pending: true, seedKey: "c" },
    )

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain("aria-controls=")
    expect(html).toContain('data-bc-grid-editor-seeded="true"')
    expect(html).toContain('data-bc-grid-editor-datalist="true"')
    expect(html).toContain("0 suggestions available")
  })

  test("checkbox editor links labels and validation descriptions", () => {
    const html = renderEditor(
      {
        editor: checkboxEditor,
        initialValue: true,
        column: { header: null, field: "active" },
      },
      { error: "Required" },
    )

    expect(html).toContain('aria-label="active"')
    expect(html).toContain('aria-describedby="')
    expect(html).toContain("Required")
    expect(html).toContain('data-bc-grid-editor-kind="checkbox"')
    expect(html).toContain('data-bc-grid-editor-state="error"')
  })
})

function renderEditor(
  entry: {
    editor: BcCellEditor<unknown, unknown>
    initialValue: unknown
    column?: Record<string, unknown>
  },
  overrides: Record<string, unknown> = {},
): string {
  const Component = entry.editor.Component as ComponentType<Record<string, unknown>>
  return renderToStaticMarkup(
    createElement(Component, {
      initialValue: entry.initialValue,
      row: {},
      rowId: "row-1",
      column: { field: "name", header: "Name", ...entry.column },
      commit: () => {},
      cancel: () => {},
      ...overrides,
    }),
  )
}
