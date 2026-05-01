import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createActionsColumn } from "../src/editGrid"
import { defaultMessages } from "../src/gridInternals"

interface Row {
  id: string
  name: string
}

describe("BcEditGrid actions column", () => {
  test("generates non-data pinned-right metadata for action chrome", () => {
    const column = createActionsColumn<Row>({
      canDelete: undefined,
      canEdit: undefined,
      deleteLabel: defaultMessages.deleteLabel,
      editLabel: defaultMessages.editLabel,
      extraActions: undefined,
      onDelete: () => {},
      onEdit: () => {},
    })

    expect(column).toMatchObject({
      align: "center",
      cellClassName: "bc-grid-actions-cell",
      columnId: "__bc_actions",
      columnMenu: false,
      editable: false,
      filter: false,
      groupable: false,
      header: defaultMessages.actionColumnLabel,
      pinned: "right",
      resizable: false,
      sortable: false,
      width: 180,
    })
  })

  test("renders action buttons with stable state hooks and no inline layout styles", () => {
    const column = createActionsColumn<Row>({
      canDelete: undefined,
      canEdit: undefined,
      deleteLabel: defaultMessages.deleteLabel,
      editLabel: defaultMessages.editLabel,
      extraActions: undefined,
      onDelete: () => {},
      onEdit: () => {},
    })
    const renderer = column.cellRenderer
    if (!renderer) throw new Error("expected actions column renderer")

    const row = { id: "r1", name: "Acme" }
    const html = renderToStaticMarkup(
      renderer({
        value: undefined,
        formattedValue: "",
        row,
        rowId: row.id,
        column,
        searchText: "",
        rowState: {
          rowId: row.id,
          index: 0,
          selected: false,
          disabled: false,
          expanded: false,
          pending: true,
        },
        editing: false,
        pending: false,
        isDirty: false,
      }),
    )

    expect(html).toContain('class="bc-grid-actions"')
    expect(html).toContain('data-bc-grid-action="true"')
    expect(html).toContain('data-variant="default"')
    expect(html).toContain('data-variant="destructive"')
    expect(html).toMatch(/data-variant="destructive"[^>]*disabled=""/)
    expect(html).not.toContain("style=")
  })
})
