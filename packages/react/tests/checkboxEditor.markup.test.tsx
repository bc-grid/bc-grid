import { describe, expect, test } from "bun:test"
import { checkboxEditor } from "@bc-grid/editors"
import { renderToStaticMarkup } from "react-dom/server"
import type { BcCellEditorProps } from "../src/types"

const Component = checkboxEditor.Component

function renderCheckboxEditor(
  props: Partial<BcCellEditorProps<unknown, unknown>> & { initialValue: unknown },
): string {
  const editorProps: BcCellEditorProps<unknown, unknown> = {
    initialValue: props.initialValue,
    row: { id: "r1" },
    rowId: "r1",
    column: {
      columnId: "active",
      field: "active",
      header: "Active",
    } as BcCellEditorProps<unknown, unknown>["column"],
    commit: () => {},
    cancel: () => {},
    ...props,
  }
  return renderToStaticMarkup(<Component {...editorProps} />)
}

describe("checkboxEditor markup", () => {
  test("renders a native checkbox that starts checked from boolean true", () => {
    const html = renderCheckboxEditor({ initialValue: true })

    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked=""')
    expect(html).toContain('data-bc-grid-editor-kind="checkbox"')
    expect(html).toContain('aria-label="Active"')
  })

  test("renders unchecked for false and non-boolean values", () => {
    const falseHtml = renderCheckboxEditor({ initialValue: false })
    const stringHtml = renderCheckboxEditor({ initialValue: "true" })

    expect(falseHtml).not.toContain('checked=""')
    expect(stringHtml).not.toContain('checked=""')
  })

  test("surfaces pending and validation state on the control", () => {
    const html = renderCheckboxEditor({
      initialValue: false,
      pending: true,
      error: "Required",
    })

    expect(html).toContain('disabled=""')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain("aria-describedby=")
    expect(html).toContain("Required")
  })
})
