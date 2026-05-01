import { describe, expect, test } from "bun:test"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { autocompleteEditor } from "../../editors/src/autocomplete"
import { dateEditor } from "../../editors/src/date"
import { datetimeEditor } from "../../editors/src/datetime"
import { multiSelectEditor } from "../../editors/src/multiSelect"
import { numberEditor } from "../../editors/src/number"
import { selectEditor } from "../../editors/src/select"
import { textEditor } from "../../editors/src/text"
import { timeEditor } from "../../editors/src/time"
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
]

describe("built-in editor chrome hooks", () => {
  test("every built-in editor emits the shared class and idle state hooks", () => {
    for (const entry of editorCases) {
      const html = renderEditor(entry)

      expect(html).toContain('class="bc-grid-editor-input"')
      expect(html).toContain('data-bc-grid-editor-input="true"')
      expect(html).toContain(`data-bc-grid-editor-kind="${entry.kind}"`)
      expect(html).toContain('data-bc-grid-editor-state="idle"')
      expect(html).toContain("aria-label=")
    }
  })

  test("pending state disables the native control and surfaces a pending hook", () => {
    for (const entry of editorCases) {
      const html = renderEditor(entry, { pending: true })

      expect(html).toContain("disabled")
      expect(html).toContain('aria-busy="true"')
      expect(html).toContain('data-bc-grid-editor-state="pending"')
      expect(html).toContain('data-bc-grid-editor-disabled="true"')
    }
  })

  test("error state surfaces aria-invalid and an error hook", () => {
    for (const entry of editorCases) {
      const html = renderEditor(entry, { error: "Required" })

      expect(html).toContain('aria-invalid="true"')
      expect(html).toContain("aria-describedby=")
      expect(html).toContain('data-bc-grid-editor-state="error"')
      expect(html).toContain("Required")
    }
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
