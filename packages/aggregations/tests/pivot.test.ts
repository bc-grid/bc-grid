import { describe, expect, test } from "bun:test"
import type { BcGridColumn, BcPivotState } from "@bc-grid/core"
import { pivot } from "../src"
import type { BcPivotCell, BcPivotRowNode } from "../src"

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

function resultValue(
  data: ReturnType<typeof pivot<SaleRow>>,
  rowKeyPath: readonly unknown[],
  colKeyPath: readonly unknown[],
  resultIndex = 0,
): unknown {
  const cell = findCell(data.cells, rowKeyPath, colKeyPath)
  return cell?.results[resultIndex]?.value
}

function findCell(
  cells: readonly BcPivotCell[],
  rowKeyPath: readonly unknown[],
  colKeyPath: readonly unknown[],
): BcPivotCell | undefined {
  return cells.find(
    (cell) =>
      JSON.stringify(cell.rowKeyPath) === JSON.stringify(rowKeyPath) &&
      JSON.stringify(cell.colKeyPath) === JSON.stringify(colKeyPath),
  )
}

function findRowNode<TRow>(
  node: BcPivotRowNode<TRow>,
  value: unknown,
): BcPivotRowNode<TRow> | undefined {
  return node.children.find((child) => child.value === value)
}

describe("pivot", () => {
  test("computes sparse row x column aggregate cells plus totals by default", () => {
    const data = pivot(rows, columns, {
      colGroups: ["quarter"],
      rowGroups: ["region"],
      values: [{ columnId: "amount" }],
    })

    expect(resultValue(data, ["East"], ["Q1"])).toBe(300)
    expect(resultValue(data, ["East"], ["Q2"])).toBe(50)
    expect(resultValue(data, ["West"], ["Q1"])).toBe(25)
    expect(findCell(data.cells, ["West"], ["Q2"])).toBeUndefined()

    expect(resultValue(data, [], [])).toBe(375)
    expect(resultValue(data, ["East"], [])).toBe(350)
    expect(resultValue(data, [], ["Q1"])).toBe(325)
  })

  test("builds nested row group trees with source rows", () => {
    const data = pivot(rows, columns, {
      colGroups: [],
      rowGroups: ["region", "account"],
      values: [{ columnId: "amount" }],
    })

    const east = findRowNode(data.rowRoot, "East")
    const enterprise = east ? findRowNode(east, "Enterprise") : undefined
    const smb = east ? findRowNode(east, "SMB") : undefined

    expect(data.rowRoot.rows).toHaveLength(4)
    expect(east?.rows).toHaveLength(3)
    expect(enterprise?.rows).toHaveLength(1)
    expect(smb?.rows).toHaveLength(2)
    expect(resultValue(data, ["East", "Enterprise"], [])).toBe(200)
    expect(resultValue(data, ["East", "SMB"], [])).toBe(150)
  })

  test("supports column-only pivots", () => {
    const data = pivot(rows, columns, {
      colGroups: ["quarter"],
      rowGroups: [],
      values: [{ columnId: "amount" }],
    })

    expect(data.rowRoot.children).toEqual([])
    expect(resultValue(data, [], ["Q1"])).toBe(325)
    expect(resultValue(data, [], ["Q2"])).toBe(50)
  })

  test("can disable row and column subtotal cells", () => {
    const state: BcPivotState = {
      colGroups: ["quarter"],
      rowGroups: ["region"],
      subtotals: { cols: false, rows: false },
      values: [{ columnId: "amount" }],
    }

    const data = pivot(rows, columns, state)

    expect(resultValue(data, ["East"], ["Q1"])).toBe(300)
    expect(findCell(data.cells, [], [])).toBeUndefined()
    expect(findCell(data.cells, ["East"], [])).toBeUndefined()
    expect(findCell(data.cells, [], ["Q1"])).toBeUndefined()
  })

  test("supports value-level aggregation overrides", () => {
    const data = pivot(rows, columns, {
      colGroups: [],
      rowGroups: ["region"],
      values: [{ columnId: "amount" }, { aggregation: { type: "count" }, columnId: "amount" }],
    })

    expect(resultValue(data, ["East"], [], 0)).toBe(350)
    expect(resultValue(data, ["East"], [], 1)).toBe(3)
  })
})
