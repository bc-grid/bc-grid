import { describe, expect, test } from "bun:test"
import type { BcGridColumn } from "@bc-grid/core"
import { rowsToChartData } from "../src/charts"

interface SaleRow {
  region: string
  quarter: string
  units: number
  revenue: number
}

const columns: readonly BcGridColumn<SaleRow>[] = [
  { columnId: "region", field: "region", header: "Region" },
  { columnId: "quarter", field: "quarter", header: "Quarter" },
  { columnId: "units", field: "units", header: "Units", aggregation: { type: "sum" } },
  { columnId: "revenue", field: "revenue", header: "Revenue", aggregation: { type: "sum" } },
]

const rows: readonly SaleRow[] = [
  { region: "North", quarter: "Q1", units: 5, revenue: 100 },
  { region: "North", quarter: "Q2", units: 7, revenue: 140 },
  { region: "South", quarter: "Q1", units: 3, revenue: 60 },
  { region: "South", quarter: "Q2", units: 4, revenue: 90 },
  { region: "East", quarter: "Q1", units: 2, revenue: 50 },
]

describe("rowsToChartData — empty / degenerate inputs", () => {
  test("empty valueColumns returns empty data", () => {
    expect(rowsToChartData(rows, columns, {})).toEqual({
      categories: [],
      series: [],
      truncated: false,
    })
  })

  test("valueColumns referencing unknown columns are dropped", () => {
    expect(rowsToChartData(rows, columns, { valueColumns: ["nonexistent"] })).toEqual({
      categories: [],
      series: [],
      truncated: false,
    })
  })

  test("empty rows produce empty categories with a single-series shape when no category column is set", () => {
    const result = rowsToChartData([], columns, { valueColumns: ["units"] })
    // No rows → no categories, but the value column is still expected to be shaped as a series
    // for chart libraries that key off series identity.
    expect(result.categories).toEqual([])
    expect(result.series).toHaveLength(1)
    expect(result.series[0]?.id).toBe("units")
    expect(result.series[0]?.values).toEqual([])
  })
})

describe("rowsToChartData — flat row aggregation", () => {
  test("groups rows by category column and sums by default", () => {
    const result = rowsToChartData(rows, columns, {
      categoryColumn: "region",
      valueColumns: ["units"],
    })
    expect(result.series).toHaveLength(1)
    expect(result.series[0]?.id).toBe("units")
    expect(result.series[0]?.label).toBe("Sum of Units")
    // Sums: North 12, South 7, East 2 — sorted desc by series-sum
    expect(result.categories).toEqual(["North", "South", "East"])
    expect(result.series[0]?.values).toEqual([12, 7, 2])
  })

  test("falls back to a single 'All' category when no category column is set", () => {
    const result = rowsToChartData(rows, columns, { valueColumns: ["units", "revenue"] })
    expect(result.categories).toEqual(["All"])
    expect(result.series.map((s) => s.id)).toEqual(["units", "revenue"])
    expect(result.series[0]?.values).toEqual([21]) // 5+7+3+4+2
    expect(result.series[1]?.values).toEqual([440]) // 100+140+60+90+50
  })

  test("multi-series: one series per valueColumn aligned to categories", () => {
    const result = rowsToChartData(rows, columns, {
      categoryColumn: "quarter",
      valueColumns: ["units", "revenue"],
    })
    // Q1 totals: units 10, revenue 210; Q2 totals: units 11, revenue 230
    // Series-sum ranking: Q2 has higher total → Q2 first
    expect(result.categories).toEqual(["Q2", "Q1"])
    expect(result.series).toHaveLength(2)
    expect(result.series[0]?.id).toBe("units")
    expect(result.series[0]?.values).toEqual([11, 10])
    expect(result.series[1]?.id).toBe("revenue")
    expect(result.series[1]?.values).toEqual([230, 210])
  })

  test("explicit categoryOrder respected; unknown categories dropped", () => {
    const result = rowsToChartData(rows, columns, {
      categoryColumn: "region",
      valueColumns: ["units"],
      categoryOrder: ["South", "North", "Atlantis"],
    })
    expect(result.categories).toEqual(["South", "North"])
    expect(result.series[0]?.values).toEqual([7, 12])
  })

  test("preserves configured fallback ids for valueGetter-only columns", () => {
    const getterColumns: readonly BcGridColumn<{ label: string; amount: number }>[] = [
      { header: "Label", valueGetter: (row) => row.label },
      { header: "Amount", valueGetter: (row) => row.amount, aggregation: { type: "sum" } },
    ]
    const result = rowsToChartData(
      [
        { label: "A", amount: 1 },
        { label: "A", amount: 2 },
        { label: "B", amount: 3 },
      ],
      getterColumns,
      {
        categoryColumn: "column-0",
        valueColumns: ["column-1"],
      },
    )
    expect(result.categories).toEqual(["A", "B"])
    expect(result.series[0]?.id).toBe("column-1")
    expect(result.series[0]?.label).toBe("Sum of Amount")
    expect(result.series[0]?.values).toEqual([3, 3])
  })
})

describe("rowsToChartData — aggregation overrides", () => {
  test("config.aggregations overrides the column's default", () => {
    const result = rowsToChartData(rows, columns, {
      categoryColumn: "region",
      valueColumns: ["units"],
      aggregations: { units: { type: "max" } },
    })
    expect(result.series[0]?.label).toBe("Max of Units")
    // Max units: North 7, South 4, East 2
    expect(result.categories).toEqual(["North", "South", "East"])
    expect(result.series[0]?.values).toEqual([7, 4, 2])
  })

  test("count aggregation produces row counts per category", () => {
    const result = rowsToChartData(rows, columns, {
      categoryColumn: "region",
      valueColumns: ["units"],
      aggregations: { units: { type: "count" } },
    })
    // Counts: North 2, South 2, East 1
    expect(result.series[0]?.label).toBe("Count of Units")
    // North + South tie at 2; sort is stable but we don't rely on tie order
    expect(result.categories).toContain("North")
    expect(result.categories).toContain("South")
    expect(result.categories[2]).toBe("East")
  })
})

describe("rowsToChartData — truncation", () => {
  test("truncates to maxCategories preserving top-N by series-sum", () => {
    // 5 distinct quarters → should truncate to 2
    const sparseRows: readonly SaleRow[] = [
      { region: "X", quarter: "Q1", units: 1, revenue: 10 },
      { region: "X", quarter: "Q2", units: 5, revenue: 50 },
      { region: "X", quarter: "Q3", units: 100, revenue: 1000 },
      { region: "X", quarter: "Q4", units: 50, revenue: 500 },
      { region: "X", quarter: "Q5", units: 2, revenue: 20 },
    ]
    const result = rowsToChartData(sparseRows, columns, {
      categoryColumn: "quarter",
      valueColumns: ["units"],
      maxCategories: 2,
    })
    expect(result.truncated).toBe(true)
    expect(result.categories).toEqual(["Q3", "Q4"])
    expect(result.series[0]?.values).toEqual([100, 50])
  })

  test("does not flag truncated when categories fit under the limit", () => {
    const result = rowsToChartData(rows, columns, {
      categoryColumn: "region",
      valueColumns: ["units"],
      maxCategories: 50,
    })
    expect(result.truncated).toBe(false)
  })
})

describe("rowsToChartData — null handling", () => {
  test("rows with null/undefined category fall into the em-dash bucket", () => {
    const mixed = [
      ...rows,
      { region: undefined as unknown as string, quarter: "Q1", units: 99, revenue: 100 },
    ]
    const result = rowsToChartData(mixed, columns, {
      categoryColumn: "region",
      valueColumns: ["units"],
    })
    expect(result.categories).toContain("—")
    const dashIndex = result.categories.indexOf("—")
    expect(result.series[0]?.values[dashIndex]).toBe(99)
  })
})
