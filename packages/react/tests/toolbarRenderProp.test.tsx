import { describe, expect, test } from "bun:test"
import type { BcSelection, RowId } from "@bc-grid/core"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn, BcGridProps, BcToolbarContext } from "../src/types"

interface Row {
  id: string
  name: string
  region: string
}

const rows: readonly Row[] = [
  { id: "a", name: "Acme", region: "North" },
  { id: "b", name: "Beacon", region: "South" },
]

const columns: readonly BcGridColumn<Row>[] = [
  { columnId: "name", field: "name", header: "Name", width: 160 },
  { columnId: "region", field: "region", header: "Region", width: 120, groupable: true },
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

describe("BcGrid toolbar render prop", () => {
  test("preserves the static toolbar slot", () => {
    const html = renderGrid({
      toolbar: <button type="button">Refresh</button>,
    })

    expect(html).toContain('class="bc-grid-toolbar"')
    expect(html).toContain("Refresh")
  })

  test("passes grid state and composable sub-slots to render-prop toolbars", () => {
    let captured: BcToolbarContext<Row> | null = null
    const html = renderGrid({
      defaultSearchText: "acme",
      defaultSelection: explicitSelection(["a"]),
      toolbar: (ctx) => {
        captured = ctx
        return (
          <>
            {ctx.searchInput}
            {ctx.groupByDropdown}
            {ctx.densityPicker}
            {ctx.clearFiltersButton}
            <span>Selected: {ctx.selectedRowCount}</span>
          </>
        )
      },
    })

    expect(html).toContain('class="bc-grid-toolbar"')
    expect(html).toContain('aria-label="Search rows"')
    expect(html).toContain('class="bc-grid-toolbar-input"')
    expect(html).toContain('value="acme"')
    expect(html).toContain('aria-label="Group rows"')
    expect(html).toContain('aria-label="Grid density"')
    expect(html).toContain("Clear filters")
    expect(html).toContain("Selected: 1")

    expect(captured?.selectedRowCount).toBe(1)
    expect(captured?.searchText).toBe("acme")
    expect(captured?.groupBy).toEqual([])
    expect(captured?.density).toBe("normal")
    expect(typeof captured?.api.getSelection).toBe("function")
    expect(typeof captured?.setSearchText).toBe("function")
    expect(typeof captured?.setGroupBy).toBe("function")
    expect(typeof captured?.setDensity).toBe("function")
    expect(captured?.savedViewPicker).toBeNull()
  })

  test("omits the toolbar wrapper when a render prop returns null", () => {
    const html = renderGrid({
      toolbar: () => null,
    })

    expect(html).not.toContain('class="bc-grid-toolbar"')
  })
})
