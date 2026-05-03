import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn } from "../src/types"

interface LedgerRow {
  id: string
  account: string
  balance: number
}

const rows: readonly LedgerRow[] = [
  { id: "a", account: "Cash", balance: 10 },
  { id: "b", account: "Receivables", balance: 20 },
  { id: "c", account: "Inventory", balance: 30 },
]

const columns = [
  { columnId: "account", field: "account", header: "Account", width: 160 },
  {
    columnId: "balance",
    field: "balance",
    header: "Balance",
    width: 120,
    aggregation: { type: "sum" },
  },
] satisfies readonly BcGridColumn<LedgerRow>[]

function renderGrid(pinnedTotals?: "top" | "bottom" | "both"): string {
  return renderToStaticMarkup(
    <BcGrid<LedgerRow>
      ariaLabel="Ledger"
      columns={columns}
      data={rows}
      height={300}
      pinnedTotals={pinnedTotals}
      rowId={(row) => row.id}
    />,
  )
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1
}

describe("pinnedTotals", () => {
  test("defaults aggregation totals to the existing bottom row", () => {
    const html = renderGrid()

    expect(html).toContain('data-position="bottom"')
    expect(html).not.toContain('data-position="top"')
    expect(html).toContain('aria-rowcount="5"')
    expect(html).toContain(">60<")
  })

  test("renders top totals outside the virtualized viewport", () => {
    const html = renderGrid("top")

    expect(html).toContain('data-position="top"')
    expect(html).not.toContain('data-position="bottom"')
    expect(html).toContain('aria-rowcount="5"')
    expect(html.indexOf('data-position="top"')).toBeLessThan(
      html.indexOf('class="bc-grid-viewport"'),
    )
  })

  test("renders both totals rows and counts both in the grid row count", () => {
    const html = renderGrid("both")

    expect(countOccurrences(html, "bc-grid-aggregation-footer-viewport")).toBe(2)
    expect(html).toContain('data-position="top"')
    expect(html).toContain('data-position="bottom"')
    expect(html).toContain('aria-rowcount="6"')
  })
})
