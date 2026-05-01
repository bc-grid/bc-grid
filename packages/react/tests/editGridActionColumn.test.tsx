import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { createActionsColumn } from "../src/editGrid"
import type { BcCellRendererParams, BcReactGridColumn } from "../src/types"

interface Row {
  id: string
  name: string
}

const baseRow: Row = { id: "r1", name: "Acme" }

function renderActionCell(
  options: Parameters<typeof createActionsColumn<Row>>[0],
  rowOverrides: Partial<BcCellRendererParams<Row>> = {},
): string {
  const column = createActionsColumn<Row>(options)
  const params: BcCellRendererParams<Row> = {
    value: undefined,
    formattedValue: "",
    row: baseRow,
    rowId: baseRow.id,
    column: column as BcReactGridColumn<Row>,
    searchText: "",
    rowState: { rowId: baseRow.id, index: 0, selected: false },
    editing: false,
    pending: false,
    dirty: false,
    ...rowOverrides,
  } as BcCellRendererParams<Row>
  return renderToStaticMarkup(column.cellRenderer?.(params) ?? null)
}

describe("BcEditGrid actions column — pinned chrome contract", () => {
  // The pinned-right actions column carries the visible chrome that
  // sits over horizontally scrolled content. The theming layer pins
  // the bg / border / state contract; this test pins the React-side
  // class hooks the CSS reads from. If a refactor drops or renames
  // the wrapper / button classes, the visual contract breaks.

  test("createActionsColumn returns a pinned-right, non-resizable column with stable column id", () => {
    const column = createActionsColumn<Row>({
      onEdit: () => {},
      onDelete: () => {},
      canEdit: undefined,
      canDelete: undefined,
      editLabel: "Edit",
      deleteLabel: "Delete",
      extraActions: undefined,
    })
    expect(column.columnId).toBe("__bc_actions")
    expect(column.pinned).toBe("right")
    expect(column.width).toBe(180)
    expect(column.sortable).toBe(false)
    expect(column.resizable).toBe(false)
    expect(column.columnMenu).toBe(false)
  })

  test("renders the `bc-grid-actions` wrapper without an inline style — chrome flows from CSS", () => {
    // Pre-cleanup the wrapper carried `style={actionsStyle}` (an
    // inline `display: flex; gap: 0.25rem; min-width: 0`). Tokenising
    // through CSS lets the theming layer add height / alignment /
    // pressed-state hooks consistently with the rest of the chrome.
    const html = renderActionCell({
      onEdit: () => {},
      onDelete: () => {},
      canEdit: undefined,
      canDelete: undefined,
      editLabel: "Edit",
      deleteLabel: "Delete",
      extraActions: undefined,
    })
    expect(html).toContain('class="bc-grid-actions"')
    expect(html).not.toMatch(/<div[^>]*class="bc-grid-actions"[^>]*style=/)
  })

  test("renders one `bc-grid-action` button per action and tags the destructive variant", () => {
    const html = renderActionCell({
      onEdit: () => {},
      onDelete: () => {},
      canEdit: undefined,
      canDelete: undefined,
      editLabel: "Edit",
      deleteLabel: "Delete",
      extraActions: undefined,
    })

    // Two buttons rendered (Edit + Delete).
    expect(html.match(/class="bc-grid-action(?:\s|")/g)?.length).toBe(2)
    // Destructive variant tagged on the Delete button.
    expect(html).toContain('class="bc-grid-action bc-grid-action-destructive"')
    // Edit button has the surface class only.
    expect(html).toMatch(/<button[^>]*class="bc-grid-action"[^>]*>[^<]*<span>Edit<\/span>/)
  })

  test("disables destructive actions while the row is in a pending commit (rowState.pending)", () => {
    // Per `editing-rfc §Server commit + optimistic UI`. Non-destructive
    // actions stay enabled — re-edit is always allowed.
    const html = renderActionCell(
      {
        onEdit: () => {},
        onDelete: () => {},
        canEdit: undefined,
        canDelete: undefined,
        editLabel: "Edit",
        deleteLabel: "Delete",
        extraActions: undefined,
      },
      { rowState: { rowId: "r1", index: 0, selected: false, pending: true }, pending: true },
    )

    // Delete button is disabled, Edit is not.
    expect(html).toMatch(
      /<button[^>]*class="bc-grid-action bc-grid-action-destructive"[^>]*disabled/,
    )
    expect(html).not.toMatch(/<button[^>]*class="bc-grid-action"[^>]*disabled[^>]*>[^<]*<span>Edit/)
  })

  test("disables every action when the row state is disabled (rowState.disabled)", () => {
    const html = renderActionCell(
      {
        onEdit: () => {},
        onDelete: () => {},
        canEdit: undefined,
        canDelete: undefined,
        editLabel: "Edit",
        deleteLabel: "Delete",
        extraActions: undefined,
      },
      {
        rowState: { rowId: "r1", index: 0, selected: false, disabled: true },
      },
    )

    // Both buttons disabled.
    expect(html.match(/<button[^>]*disabled/g)?.length).toBe(2)
  })

  test("custom extra action with `disabled: () => true` predicate disables the matching button", () => {
    const html = renderActionCell({
      onEdit: undefined,
      onDelete: undefined,
      canEdit: undefined,
      canDelete: undefined,
      editLabel: "Edit",
      deleteLabel: "Delete",
      extraActions: [
        {
          label: "Approve",
          onSelect: () => {},
          disabled: () => true,
        },
      ],
    })
    expect(html).toMatch(/<button[^>]*class="bc-grid-action"[^>]*disabled[^>]*>[^<]*<span>Approve/)
  })
})
