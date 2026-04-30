import { describe, expect, test } from "bun:test"
import type { BcGridColumn } from "@bc-grid/core"
import {
  aggregate,
  aggregateColumns,
  aggregateGroups,
  aggregationRegistry,
  avg,
  count,
  max,
  min,
  registerAggregation,
  sum,
} from "../src"

interface Row {
  id: string
  amount?: number | null
  category?: string
  date?: Date
}

const amountColumn = {
  aggregation: { type: "sum" },
  columnId: "amount",
  field: "amount",
  header: "Amount",
} satisfies BcGridColumn<Row, number | null | undefined>

describe("@bc-grid/aggregations built-ins", () => {
  test("sum skips nullish and non-finite values", () => {
    const result = aggregate(
      [
        { amount: 2, id: "a" },
        { amount: null, id: "b" },
        { amount: 5, id: "c" },
      ],
      amountColumn,
      sum(),
    )

    expect(result.value).toBe(7)
    expect(result.rowCount).toBe(2)
  })

  test("count includes every row", () => {
    const result = aggregate(
      [{ amount: 2, id: "a" }, { amount: null, id: "b" }, { id: "c" }],
      amountColumn,
      count(),
    )

    expect(result.value).toBe(3)
    expect(result.rowCount).toBe(3)
  })

  test("avg returns null for empty contributing rows", () => {
    const result = aggregate([{ amount: null, id: "a" }], amountColumn, avg())

    expect(result.value).toBeNull()
    expect(result.rowCount).toBe(0)
  })

  test("min and max compare numbers, strings, and dates", () => {
    const categoryColumn = {
      columnId: "category",
      field: "category",
      header: "Category",
    } satisfies BcGridColumn<Row, string | undefined>
    const dateColumn = {
      columnId: "date",
      field: "date",
      header: "Date",
    } satisfies BcGridColumn<Row, Date | undefined>
    const rows = [
      { amount: 2, category: "Beta", date: new Date("2026-01-02"), id: "a" },
      { amount: 5, category: "Alpha", date: new Date("2026-01-01"), id: "b" },
    ]

    expect(aggregate(rows, amountColumn, min()).value).toBe(2)
    expect(aggregate(rows, amountColumn, max()).value).toBe(5)
    expect(aggregate(rows, categoryColumn, min()).value).toBe("Alpha")
    expect(aggregate(rows, dateColumn, max()).value).toEqual(new Date("2026-01-02"))
  })

  test("merge matches a single full reduction", () => {
    const aggregation = sum()
    const ctx = { column: amountColumn, columnId: "amount" }
    const left = aggregation.step(aggregation.init(ctx), 2, { id: "a" }, ctx)
    const right = [3, 4].reduce(
      (acc, value) => aggregation.step(acc, value, { id: String(value) }, ctx),
      aggregation.init(ctx),
    )

    expect(aggregation.finalize(aggregation.merge(left, right, ctx), ctx)).toBe(
      aggregate(
        [
          { amount: 2, id: "a" },
          { amount: 3, id: "b" },
          { amount: 4, id: "c" },
        ],
        amountColumn,
        aggregation,
      ).value,
    )
  })
})

describe("@bc-grid/aggregations drivers", () => {
  test("aggregateColumns resolves column aggregation definitions", () => {
    const rows = [
      { amount: 2, id: "a" },
      { amount: 5, id: "b" },
    ]
    const columns = [
      amountColumn,
      {
        aggregation: { type: "max" },
        columnId: "id",
        field: "id",
        header: "ID",
      } satisfies BcGridColumn<Row, string>,
    ]

    expect(
      aggregateColumns(rows, columns).map((result) => [result.columnId, result.value]),
    ).toEqual([
      ["amount", 7],
      ["id", "b"],
    ])
  })

  test("aggregateGroups computes each group independently", () => {
    const grouped = new Map([
      ["open", [{ amount: 2, id: "a" }]],
      [
        "closed",
        [
          { amount: 5, id: "b" },
          { amount: 7, id: "c" },
        ],
      ],
    ])

    const results = aggregateGroups(grouped, [amountColumn])

    expect(results.get("open")?.[0]?.value).toBe(2)
    expect(results.get("closed")?.[0]?.value).toBe(12)
  })

  test("registerAggregation adds custom definitions to the registry", () => {
    registerAggregation({
      id: "double-count",
      init: () => 0,
      step: (acc) => acc + 2,
      merge: (a, b) => a + b,
      finalize: (acc) => acc,
    })

    const doubleCount = aggregationRegistry.get("double-count")
    if (!doubleCount) throw new Error("double-count aggregation was not registered")
    expect(doubleCount.id).toBe("double-count")
    expect(
      aggregateColumns(
        [{ id: "a" }, { id: "b" }],
        [
          {
            aggregation: {
              type: "custom",
              custom: doubleCount,
            },
            columnId: "id",
            field: "id",
            header: "ID",
          },
        ],
      )[0]?.value,
    ).toBe(4)
  })

  test("legacy custom aggregation receives contributing rows", () => {
    const result = aggregateColumns(
      [{ id: "a" }, { id: "b" }],
      [
        {
          aggregation: { type: "custom", custom: (rows) => rows.length },
          columnId: "id",
          field: "id",
          header: "ID",
        },
      ],
    )

    expect(result[0]?.value).toBe(2)
  })
})
