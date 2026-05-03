import { describe, expect, test } from "bun:test"
import type { BcCellPosition, BcRange, ColumnId, RowId } from "@bc-grid/core"
import { buildLiteralRangeFillTsv, projectRangeFill } from "../src/rangeFill"

const rowIds = ["r1", "r2", "r3", "r4", "r5"] as RowId[]
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

  test("builds a literal repeat TSV for the projected fill range", () => {
    const projection = projectRangeFill({
      sourceRange: range("r1", "name", "r2", "amount"),
      target: position("r5", "name"),
      columns,
      rowIds,
    })
    if (!projection) throw new Error("Expected fill projection")

    const tsv = buildLiteralRangeFillTsv({
      projection,
      columns,
      rowIds,
      getSourceValue: sourceValue,
    })

    expect(tsv).toBe("Ada\t10\nGrace\t20\nAda\t10")
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

function column(columnId: string): { readonly columnId: ColumnId } {
  return { columnId: columnId as ColumnId }
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
