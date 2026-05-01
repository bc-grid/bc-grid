import { describe, expect, test } from "bun:test"
import { type ComponentType, createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { textEditor } from "../../editors/src/text"
import type { BcCellEditorProps, BcReactGridColumn } from "../src/types"

interface Row {
  id: string
  name: string
}

const stubColumn: BcReactGridColumn<Row, string> = {
  field: "name",
  header: "Customer name",
}

function renderText(overrides: Partial<BcCellEditorProps<Row, string>> = {}): string {
  const Component = textEditor.Component as ComponentType<BcCellEditorProps<Row, string>>
  const props: BcCellEditorProps<Row, string> = {
    initialValue: "Acme",
    row: { id: "r-1", name: "Acme" } as Row,
    rowId: "r-1" as BcCellEditorProps<Row, string>["rowId"],
    column: stubColumn,
    commit: () => {},
    cancel: () => {},
    ...overrides,
  }
  return renderToStaticMarkup(createElement(Component, props))
}

describe("textEditor — ARIA contract per editing-rfc §a11y for edit mode", () => {
  // Pin the per-input ARIA surface so a future refactor can't silently
  // drop the AT-facing wiring. The framework's polite live region also
  // announces validation messages at commit time, but the per-input
  // aria-describedby carries the message into subsequent Tab reads;
  // dropping it leaves AT users with "invalid" but no reason.

  test("aria-label inherits the column header so AT announces the column context", () => {
    const html = renderText()
    expect(html).toContain('aria-label="Customer name"')
  })

  test("aria-label falls back to column.field when header is not a plain string (render-function header)", () => {
    const html = renderText({
      column: {
        ...stubColumn,
        header: createElement("span", null, "Customer name"),
      } as unknown as BcReactGridColumn<Row, string>,
    })
    expect(html).toContain('aria-label="name"')
  })

  test("aria-invalid + aria-describedby fire only when error is set; describedby targets the hidden span carrying the error text", () => {
    const idle = renderText()
    expect(idle).not.toContain("aria-invalid")
    expect(idle).not.toContain("aria-describedby")

    const erroring = renderText({ error: "Required" })
    expect(erroring).toContain('aria-invalid="true"')
    // aria-describedby points at a useId() — pin the linkage shape:
    // the input's `aria-describedby` value must equal the `<span>`'s
    // `id` so AT users hear the error after "invalid".
    const describedByMatch = erroring.match(/aria-describedby="([^"]+)"/)
    expect(describedByMatch).not.toBeNull()
    const errorId = describedByMatch?.[1] ?? ""
    expect(errorId.length).toBeGreaterThan(0)
    expect(erroring).toContain(`<span id="${errorId}"`)
    expect(erroring).toContain(">Required</span>")
  })

  test("the error span is visually hidden but still in the AT tree (no `display: none` / `visibility: hidden`)", () => {
    // Visually-hidden technique keeps the span discoverable by AT
    // (clip-path / position absolute / width 1px); display:none /
    // visibility:hidden would remove it from the AT tree and the
    // describedby would resolve to nothing.
    const html = renderText({ error: "Required" })
    const spanMatch = html.match(/<span id="[^"]+" style="([^"]+)"/)
    expect(spanMatch).not.toBeNull()
    const style = spanMatch?.[1] ?? ""
    expect(style).not.toContain("display:none")
    expect(style).not.toContain("display: none")
    expect(style).not.toContain("visibility:hidden")
    expect(style).not.toContain("visibility: hidden")
  })

  test("pending disables the input and emits data-state=pending so Enter / Tab can't double-commit during async settle", () => {
    const html = renderText({ pending: true })
    expect(html).toContain("disabled")
    expect(html).toContain('data-bc-grid-editor-state="pending"')
  })

  test("pending wins over error on data-state (async commit in flight outranks a stale validation error)", () => {
    // Theming layer keys disabled chrome off the data-state attribute;
    // the precedence keeps the spinner / disabled treatment visible
    // when a server commit is mid-flight after a validation rejection.
    // aria-invalid still reflects the error so AT users hear the
    // validator's message during pending.
    const html = renderText({ pending: true, error: "Required" })
    expect(html).toContain('data-bc-grid-editor-state="pending"')
    expect(html).not.toContain('data-bc-grid-editor-state="error"')
    expect(html).toContain("disabled")
    expect(html).toContain('aria-invalid="true"')
  })

  test("idle state is the explicit default (no `disabled`, no `aria-invalid`, no `aria-describedby`, data-state=idle)", () => {
    // Negative pin: catches a regression that keeps the input
    // disabled after the commit settles, or leaves a stale describedby
    // pointing at an empty span.
    const html = renderText()
    expect(html).toContain('data-bc-grid-editor-state="idle"')
    expect(html).not.toContain("disabled")
    expect(html).not.toContain("aria-invalid")
    expect(html).not.toContain("aria-describedby")
  })

  test("seedKey replaces initialValue on the input (printable activation seeds the user's first keystroke)", () => {
    const html = renderText({ initialValue: "Acme", seedKey: "x" })
    expect(html).toContain('value="x"')
    expect(html).not.toContain('value="Acme"')
  })

  test("data-bc-grid-editor-input + data-bc-grid-editor-kind hooks survive — theming layer reads them", () => {
    const html = renderText()
    expect(html).toContain('data-bc-grid-editor-input="true"')
    expect(html).toContain('data-bc-grid-editor-kind="text"')
  })
})
