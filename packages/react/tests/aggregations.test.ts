import { describe, expect, test } from "bun:test"
import { aggregateColumns } from "@bc-grid/aggregations"
import {
  aggregationResultsByColumnId,
  formatAggregationResult,
  resolveAggregationRows,
} from "../src/aggregations"
import type { BcGridColumn } from "../src/types"

interface LedgerRow {
  id: string
  balance: number
}

const rows: LedgerRow[] = [
  { id: "a", balance: 10 },
  { id: "b", balance: 20 },
  { id: "c", balance: 30 },
]

const columns = [
  {
    columnId: "balance",
    field: "balance",
    header: "Balance",
    format: { type: "currency", currency: "USD", precision: 0 },
    aggregation: { type: "sum" },
  },
] satisfies readonly BcGridColumn<LedgerRow>[]

describe("resolveAggregationRows", () => {
  test("uses filtered rows by default", () => {
    expect(
      resolveAggregationRows({
        allRows: rows,
        rows: rows.slice(0, 2),
        scope: "filtered",
      }),
    ).toEqual(rows.slice(0, 2))
  })

  test("uses all rows for all scope", () => {
    expect(
      resolveAggregationRows({
        allRows: rows,
        rows: rows.slice(0, 1),
        scope: "all",
      }),
    ).toEqual(rows)
  })

  test("uses selected row ids for selected scope", () => {
    expect(
      resolveAggregationRows({
        allRows: rows,
        rowId: (row) => row.id,
        rows,
        scope: "selected",
        selection: { mode: "explicit", rowIds: new Set(["b", "c"]) },
      }),
    ).toEqual(rows.slice(1))
  })
})

describe("aggregation formatting", () => {
  test("maps results by column id and applies column preset formats", () => {
    const results = aggregateColumns(rows, columns)
    const byColumnId = aggregationResultsByColumnId(results)
    const result = byColumnId.get("balance")
    if (!result) throw new Error("expected balance result")

    expect(result.value).toBe(60)
    expect(formatAggregationResult(result, columns[0], "en-US")).toBe("$60")
  })
})
