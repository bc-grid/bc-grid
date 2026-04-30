import { describe, expect, test } from "bun:test"
import { pivot } from "@bc-grid/aggregations"
import type { BcPivotState } from "@bc-grid/core"
import { buildPivotViewModel, pivotCellKey } from "../src/pivotGrid"
import type { BcGridColumn } from "../src/types"

interface SaleRow {
  id: string
  account: string
  amount: number
  quarter: "Q1" | "Q2"
  region: "East" | "West"
}

const rows: SaleRow[] = [
  { account: "SMB", amount: 100, id: "a", quarter: "Q1", region: "East" },
  { account: "SMB", amount: 50, id: "b", quarter: "Q2", region: "East" },
  { account: "Enterprise", amount: 200, id: "c", quarter: "Q1", region: "East" },
  { account: "SMB", amount: 25, id: "d", quarter: "Q1", region: "West" },
]

const columns = [
  { columnId: "region", field: "region", header: "Region" },
  { columnId: "account", field: "account", header: "Account" },
  { columnId: "quarter", field: "quarter", header: "Quarter" },
  {
    aggregation: { type: "sum" },
    columnId: "amount",
    field: "amount",
    header: "Amount",
  },
] satisfies readonly BcGridColumn<SaleRow>[]

describe("buildPivotViewModel", () => {
  test("projects nested row groups, column groups, and aggregate cell lookups", () => {
    const state: BcPivotState = {
      colGroups: ["quarter"],
      rowGroups: ["region", "account"],
      values: [{ columnId: "amount" }],
    }

    const model = buildModel(state)

    expect(
      model.rows.map((row) => ({
        isSubtotal: row.isSubtotal,
        isTotal: row.isTotal,
        label: row.label,
        level: row.level,
      })),
    ).toEqual([
      { isSubtotal: true, isTotal: false, label: "East Total", level: 1 },
      { isSubtotal: false, isTotal: false, label: "Enterprise", level: 2 },
      { isSubtotal: false, isTotal: false, label: "SMB", level: 2 },
      { isSubtotal: true, isTotal: false, label: "West Total", level: 1 },
      { isSubtotal: false, isTotal: false, label: "SMB", level: 2 },
      { isSubtotal: false, isTotal: true, label: "Grand Total", level: 1 },
    ])
    expect(model.columns.map((column) => column.kind)).toEqual(["axis", "value", "value", "value"])
    expect(model.headerRows.map((row) => row.map((cell) => cell.label))).toEqual([
      ["Q1", "Q2", "Grand Total"],
      ["Amount (sum)", "Amount (sum)", "Amount (sum)"],
    ])
    expect(model.headerRows[0]?.map((cell) => cell.colSpan)).toEqual([1, 1, 1])

    expect(model.cellByKey.get(pivotCellKey(["East"], ["Q1"]))?.results[0]?.value).toBe(300)
    expect(model.cellByKey.get(pivotCellKey(["East", "SMB"], ["Q2"]))?.results[0]?.value).toBe(50)
    expect(model.cellByKey.get(pivotCellKey([], []))?.results[0]?.value).toBe(375)
  })

  test("renders multiple value columns against the total column path", () => {
    const state: BcPivotState = {
      colGroups: [],
      rowGroups: ["region"],
      values: [
        { columnId: "amount" },
        { aggregation: { type: "count" }, columnId: "amount", label: "Rows" },
      ],
    }

    const model = buildModel(state)

    expect(model.columns).toHaveLength(3)
    expect(model.headerRows.map((row) => row.map((cell) => cell.label))).toEqual([
      ["Amount (sum)", "Rows"],
    ])
    expect(
      model.cellByKey.get(pivotCellKey(["East"], []))?.results.map((result) => result.value),
    ).toEqual([350, 3])
  })

  test("omits subtotal display rows and columns when subtotals are disabled", () => {
    const state: BcPivotState = {
      colGroups: ["quarter"],
      rowGroups: ["region", "account"],
      subtotals: { cols: false, rows: false },
      values: [{ columnId: "amount" }],
    }

    const model = buildModel(state)

    expect(model.rows.map((row) => row.label)).toEqual(["Enterprise", "SMB", "SMB"])
    expect(model.headerRows.map((row) => row.map((cell) => cell.label))).toEqual([
      ["Q1", "Q2"],
      ["Amount (sum)", "Amount (sum)"],
    ])
    expect(model.cellByKey.get(pivotCellKey([], []))).toBeUndefined()
  })

  test("keeps a stable row-axis-only model when no values resolve", () => {
    const model = buildModel({
      colGroups: ["quarter"],
      rowGroups: ["region"],
      values: [{ columnId: "missing" }],
    })

    expect(model.columns.map((column) => column.kind)).toEqual(["axis"])
    expect(model.headerRows).toEqual([[]])
    expect(model.rows.map((row) => row.label)).toEqual(["East", "West", "Grand Total"])
  })
})

function buildModel(state: BcPivotState) {
  const pivoted = pivot(rows, columns, state)
  return buildPivotViewModel({
    columns,
    locale: "en-US",
    pivoted,
    state,
  })
}
