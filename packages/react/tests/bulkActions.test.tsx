import { describe, expect, test } from "bun:test"
import type { BcSelection, RowId } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { resolveBulkActionSelectedRowIds } from "../src/bulkActions"
import { BcGrid } from "../src/grid"
import type { BcBulkActionsContext, BcGridColumn, BcGridProps } from "../src/types"

interface Row {
  id: string
  name: string
}

const rows: readonly Row[] = [
  { id: "a", name: "Acme" },
  { id: "b", name: "Beacon" },
  { id: "c", name: "Cobalt" },
]

const columns: readonly BcGridColumn<Row>[] = [
  { columnId: "name", field: "name", header: "Name", width: 160 },
]

function explicitSelection(ids: readonly string[]): BcSelection {
  return { mode: "explicit", rowIds: new Set(ids.map((id) => id as RowId)) }
}

function renderGrid(props: Partial<BcGridProps<Row>> = {}): string {
  return renderToStaticMarkup(
    <BcGrid<Row>
      ariaLabel="Customers"
      columns={columns}
      data={rows}
      height={240}
      rowId={(row) => row.id}
      {...props}
    />,
  )
}

describe("BcGrid bulkActions slot", () => {
  test("renders the bar with count, clear button, and render-prop actions when rows are selected", () => {
    let captured: BcBulkActionsContext | null = null
    const html = renderGrid({
      defaultSelection: explicitSelection(["a", "b"]),
      bulkActions: (ctx) => {
        captured = ctx
        return <button type="button">Mark paid {ctx.selectedRowIds.map(String).join("|")}</button>
      },
    })

    expect(html).toContain('class="bc-grid-bulk-actions"')
    expect(html).toContain('aria-label="2 selected rows"')
    expect(html).toContain('class="bc-grid-bulk-actions-count">2 selected')
    expect(html).toContain("Mark paid a|b")
    expect(html).toContain('aria-label="Clear selection"')
    expect(captured?.selectedRowCount).toBe(2)
    expect(captured?.selectedRowIds.map(String)).toEqual(["a", "b"])
    expect(typeof captured?.clearSelection).toBe("function")
  })

  test("does not render the bar when selection is empty", () => {
    const html = renderGrid({
      defaultSelection: explicitSelection([]),
      bulkActions: <button type="button">Archive</button>,
    })

    expect(html).not.toContain('class="bc-grid-bulk-actions"')
    expect(html).not.toContain("Archive")
  })

  test("accepts static action nodes while the grid owns count and dismiss chrome", () => {
    const html = renderGrid({
      defaultSelection: explicitSelection(["c"]),
      bulkActions: <button type="button">Move to folder</button>,
    })

    expect(html).toContain('aria-label="1 selected row"')
    expect(html).toContain('class="bc-grid-bulk-actions-count">1 selected')
    expect(html).toContain("Move to folder")
    expect(html).toContain('class="bc-grid-bulk-actions-clear"')
  })
})

describe("resolveBulkActionSelectedRowIds", () => {
  const allRows = rows.map((row) => ({ rowId: row.id as RowId }))
  const filteredRows = allRows.slice(0, 2)

  test("returns explicit row IDs without requiring known row data", () => {
    expect(
      resolveBulkActionSelectedRowIds(explicitSelection(["c", "missing"]), allRows, filteredRows),
    ).toEqual(["c", "missing"])
  })

  test("resolves all-mode selection against all known rows minus exceptions", () => {
    expect(
      resolveBulkActionSelectedRowIds(
        { mode: "all", except: new Set<RowId>(["b" as RowId]) },
        allRows,
        filteredRows,
      ).map(String),
    ).toEqual(["a", "c"])
  })

  test("resolves filtered-mode selection against filtered rows minus exceptions", () => {
    expect(
      resolveBulkActionSelectedRowIds(
        { mode: "filtered", viewKey: "customers", except: new Set<RowId>(["a" as RowId]) },
        allRows,
        filteredRows,
      ).map(String),
    ).toEqual(["b"])
  })
})
