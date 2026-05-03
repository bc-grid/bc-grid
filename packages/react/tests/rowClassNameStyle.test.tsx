import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { BcGrid } from "../src/grid"
import type { BcGridColumn, BcGridRowParams } from "../src/types"

type Row = { id: string; status: "open" | "overdue" | "archived"; amount: number }

const ROWS: Row[] = [
  { id: "r1", status: "open", amount: 100 },
  { id: "r2", status: "overdue", amount: 250 },
  { id: "r3", status: "archived", amount: 50 },
]

const COLUMNS: BcGridColumn<Row>[] = [
  { columnId: "id", field: "id" },
  { columnId: "status", field: "status" },
  { columnId: "amount", field: "amount" },
]

const renderGrid = (extra: object = {}) =>
  renderToStaticMarkup(
    <BcGrid data={ROWS} columns={COLUMNS} rowId={(row) => row.id} gridId="test" {...extra} />,
  )

describe("BcGridProps.rowClassName", () => {
  test("string form is applied to every data row", () => {
    const html = renderGrid({ rowClassName: "ledger-row" })
    expect(html).toContain('data-row-id="r1"')
    expect(html.match(/ledger-row/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  test("function form receives row params and applies per-row className", () => {
    const calls: BcGridRowParams<Row>[] = []
    const html = renderGrid({
      rowClassName: (params: BcGridRowParams<Row>) => {
        calls.push(params)
        return params.row.status === "overdue" ? "row-overdue" : undefined
      },
    })
    expect(calls.length).toBe(3)
    expect(calls[0]?.row.id).toBe("r1")
    expect(calls[1]?.row.id).toBe("r2")
    expect(html).toContain("row-overdue")
    expect(html.match(/row-overdue/g)?.length).toBe(1)
  })

  test("composes with built-in row classes — built-ins still present", () => {
    const html = renderGrid({ rowClassName: "custom" })
    expect(html).toContain("bc-grid-row")
    expect(html).toContain("custom")
  })

  test("function returning undefined skips the className for that row", () => {
    const html = renderGrid({
      rowClassName: (params: BcGridRowParams<Row>) =>
        params.row.amount > 200 ? "high-amount" : undefined,
    })
    expect(html.match(/high-amount/g)?.length).toBe(1)
  })
})

describe("BcGridProps.rowStyle", () => {
  test("object form is applied to every data row", () => {
    const html = renderGrid({ rowStyle: { backgroundColor: "papayawhip" } })
    expect(html.match(/papayawhip/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  test("function form receives row params and returns per-row style", () => {
    const html = renderGrid({
      rowStyle: (params: BcGridRowParams<Row>) =>
        params.row.status === "archived" ? { opacity: 0.5 } : undefined,
    })
    expect(html.match(/opacity:\s*0?\.5/g)?.length).toBe(1)
  })

  test("consumer style overrides framework style on collision", () => {
    const html = renderGrid({ rowStyle: { width: "9999px" } })
    expect(html).toContain("width:9999px")
  })
})

describe("group rows are NOT subject to rowClassName / rowStyle", () => {
  test("groupBy active — rowClassName function is called only for data rows", () => {
    const calls: BcGridRowParams<Row>[] = []
    renderGrid({
      groupBy: ["status"],
      defaultExpansion: new Set(["__group__:status:open", "__group__:status:overdue"]),
      rowClassName: (params: BcGridRowParams<Row>) => {
        calls.push(params)
        return undefined
      },
    })
    expect(calls.length).toBeLessThanOrEqual(ROWS.length)
    for (const params of calls) {
      expect(["r1", "r2", "r3"]).toContain(params.rowId as string)
    }
  })
})
