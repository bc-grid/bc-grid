import { describe, expect, test } from "bun:test"
import type { BcCellPosition, BcRange, ColumnId, RowId } from "@bc-grid/core"
import { buildRangeFillTsv, projectRangeFill } from "../src/rangeFill"
import type { BcFillSeries } from "../src/types"

const rowIds = ["r1", "r2", "r3", "r4", "r5", "r6"] as RowId[]
const columns = [column("name"), column("amount"), column("status"), column("owner")]

describe("range fill helpers", () => {
  test("projects a vertical fill while preserving the source column span", () => {
    const projection = projectRangeFill({
      sourceRange: range("r1", "name", "r2", "amount"),
      target: position("r5", "owner"),
      columns,
      rowIds,
    })

    expect(projection).toMatchObject({
      direction: "down",
      targetRange: range("r1", "name", "r5", "amount"),
      fillRange: range("r3", "name", "r5", "amount"),
    })
  })

  test("projects a horizontal fill while preserving the source row span", () => {
    const projection = projectRangeFill({
      sourceRange: range("r2", "amount", "r3", "status"),
      target: position("r3", "owner"),
      columns,
      rowIds,
    })

    expect(projection).toMatchObject({
      direction: "right",
      targetRange: range("r2", "amount", "r3", "owner"),
      fillRange: range("r2", "owner", "r3", "owner"),
    })
  })

  test("returns null while the pointer is still inside the source range", () => {
    expect(
      projectRangeFill({
        sourceRange: range("r2", "amount", "r3", "status"),
        target: position("r2", "status"),
        columns,
        rowIds,
      }),
    ).toBeNull()
  })

  test("builds a series-aware TSV for the projected fill range", () => {
    const projection = projectRangeFill({
      sourceRange: range("r1", "name", "r2", "amount"),
      target: position("r5", "name"),
      columns,
      rowIds,
    })
    if (!projection) throw new Error("Expected fill projection")

    const tsv = buildRangeFillTsv({
      projection,
      columns,
      rowIds,
      getSourceValue: sourceValue,
    })

    expect(tsv).toBe("Ada\t30\nGrace\t40\nAda\t50")
  })

  test("keeps a single numeric source cell literal by default", () => {
    const projection = fillDown("r1", "amount", "r4")

    const tsv = buildRangeFillTsv({
      projection,
      columns,
      rowIds,
      getSourceValue: values({ "r1:amount": 5 }),
    })

    expect(tsv).toBe("5\n5\n5")
  })

  test("extrapolates numeric arithmetic series down the target cells", () => {
    const projection = fillDown("r1", "amount", "r5", "r2")

    const tsv = buildRangeFillTsv({
      projection,
      columns,
      rowIds,
      getSourceValue: values({ "r1:amount": 5, "r2:amount": 7 }),
    })

    expect(tsv).toBe("9\n11\n13")
  })

  test("falls back to literal repeat for inconsistent numeric source deltas", () => {
    const projection = fillDown("r1", "amount", "r6", "r3")

    const tsv = buildRangeFillTsv({
      projection,
      columns,
      rowIds,
      getSourceValue: values({ "r1:amount": 5, "r2:amount": 7, "r3:amount": 12 }),
    })

    expect(tsv).toBe("5\n7\n12")
  })

  test("increments a single source date by one day", () => {
    const projection = fillDown("r1", "amount", "r3")

    const tsv = buildRangeFillTsv({
      projection,
      columns: [column("name"), column("amount", { format: "date" })],
      rowIds,
      getSourceValue: values({ "r1:amount": "2026-05-01" }),
    })

    expect(tsv).toBe("2026-05-02\n2026-05-03")
  })

  test("infers calendar month date increments from a two-cell source", () => {
    const projection = fillDown("r1", "amount", "r4", "r2")

    const tsv = buildRangeFillTsv({
      projection,
      columns: [column("name"), column("amount", { format: "date" })],
      rowIds,
      getSourceValue: values({
        "r1:amount": "2026-01-31T00:00:00.000Z",
        "r2:amount": "2026-02-28T00:00:00.000Z",
      }),
    })

    expect(tsv).toBe("2026-03-31\n2026-04-30")
  })

  test("continues weekday and month-name series using the grid locale", () => {
    const weekdayProjection = fillDown("r1", "status", "r3")
    const monthProjection = fillDown("r1", "owner", "r3")

    const weekdayTsv = buildRangeFillTsv({
      projection: weekdayProjection,
      columns,
      rowIds,
      getSourceValue: values({ "r1:status": "Mon" }),
      locale: "en-US",
    })
    const monthTsv = buildRangeFillTsv({
      projection: monthProjection,
      columns,
      rowIds,
      getSourceValue: values({ "r1:owner": "Jan" }),
      locale: "en-US",
    })

    expect(weekdayTsv).toBe("Tue\nWed")
    expect(monthTsv).toBe("Feb\nMar")
  })

  test("continues quarter labels", () => {
    const projection = fillRight("r1", "name", "owner")

    const tsv = buildRangeFillTsv({
      projection,
      columns,
      rowIds,
      getSourceValue: values({ "r1:name": "Q1" }),
    })

    expect(tsv).toBe("Q2\tQ3\tQ4")
  })

  test("uses column fillSeries hints for built-in and custom overrides", () => {
    const linearProjection = fillDown("r1", "amount", "r3")
    const customProjection = fillDown("r1", "status", "r3")
    const hintedColumns = [
      column("name"),
      column("amount", { fillSeries: "linear" }),
      column("status", {
        fillSeries: (_source, fillCells) =>
          fillCells.map((cell) => `${cell.position.rowId}:${cell.position.columnId}`),
      }),
    ]

    const linearTsv = buildRangeFillTsv({
      projection: linearProjection,
      columns: hintedColumns,
      rowIds,
      getSourceValue: values({ "r1:amount": 5 }),
    })
    const customTsv = buildRangeFillTsv({
      projection: customProjection,
      columns: hintedColumns,
      rowIds,
      getSourceValue: values({ "r1:status": "Open" }),
    })

    expect(linearTsv).toBe("6\n7")
    expect(customTsv).toBe("r2:status\nr3:status")
  })
})

function sourceValue(position: BcCellPosition): unknown {
  return `${position.rowId}:${position.columnId}` === "r1:name"
    ? "Ada"
    : `${position.rowId}:${position.columnId}` === "r1:amount"
      ? 10
      : `${position.rowId}:${position.columnId}` === "r2:name"
        ? "Grace"
        : `${position.rowId}:${position.columnId}` === "r2:amount"
          ? 20
          : ""
}

function values(entries: Readonly<Record<string, unknown>>) {
  return (position: BcCellPosition): unknown => entries[`${position.rowId}:${position.columnId}`]
}

function fillDown(
  startRowId: string,
  columnId: string,
  targetRowId: string,
  endRowId = startRowId,
) {
  const projection = projectRangeFill({
    sourceRange: range(startRowId, columnId, endRowId, columnId),
    target: position(targetRowId, columnId),
    columns,
    rowIds,
  })
  if (!projection) throw new Error("Expected fill projection")
  return projection
}

function fillRight(rowId: string, startColumnId: string, targetColumnId: string) {
  const projection = projectRangeFill({
    sourceRange: range(rowId, startColumnId, rowId, startColumnId),
    target: position(rowId, targetColumnId),
    columns,
    rowIds,
  })
  if (!projection) throw new Error("Expected fill projection")
  return projection
}

function column(
  columnId: string,
  options: { fillSeries?: BcFillSeries; format?: "date" } = {},
): { readonly columnId: ColumnId; readonly fillSeries?: BcFillSeries; readonly format?: "date" } {
  return { columnId: columnId as ColumnId, ...options }
}

function position(rowId: string, columnId: string): BcCellPosition {
  return { rowId: rowId as RowId, columnId: columnId as ColumnId }
}

function range(startRowId: string, startColumnId: string, endRowId: string, endColumnId: string) {
  return {
    start: position(startRowId, startColumnId),
    end: position(endRowId, endColumnId),
  } satisfies BcRange
}
