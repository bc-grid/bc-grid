import { describe, expect, test } from "bun:test"
import type { BcRange, ColumnId, RowId } from "@bc-grid/core"
import { buildRangeFill, prepareRangeFill, targetRangeForFillDrag } from "../src/fillHandle"
import type { ResolvedColumn, RowEntry } from "../src/gridInternals"

interface Row {
  id: string
  label: string
  amount: number
  due: string
}

const rows: Row[] = [
  { id: "r1", label: "A", amount: 1, due: "2026-01-01" },
  { id: "r2", label: "B", amount: 2, due: "2026-01-08" },
  { id: "r3", label: "C", amount: 3, due: "2026-01-15" },
  { id: "r4", label: "D", amount: 4, due: "2026-01-22" },
  { id: "r5", label: "E", amount: 5, due: "2026-01-29" },
]

const rowEntries: RowEntry<Row>[] = rows.map((row, index) => dataRow(row, index))
const rowIds = rowEntries.map((entry) => entry.rowId)

const columns: ResolvedColumn<Row>[] = [
  resolvedColumn("label", "Label", { editable: true }),
  resolvedColumn("amount", "Amount", {
    editable: true,
    valueParser: (input) => Number(input),
    validate: (value) =>
      typeof value === "number" && Number.isFinite(value) && value <= 4
        ? { valid: true }
        : { valid: false, error: "Amount must be at most 4." },
  }),
  resolvedColumn("due", "Due", {
    editable: true,
    valueParser: (input) => input,
  }),
]

function resolvedColumn(
  field: keyof Row & string,
  header: string,
  overrides: Partial<ResolvedColumn<Row>["source"]> = {},
): ResolvedColumn<Row> {
  return {
    source: { field, header, ...overrides },
    columnId: field as ColumnId,
    left: 0,
    width: 100,
    align: "left",
    pinned: null,
    position: 0,
  }
}

function dataRow(row: Row, index: number): RowEntry<Row> {
  return { kind: "data", row, rowId: row.id as RowId, index }
}

function range(startRow: string, startCol: string, endRow: string, endCol: string): BcRange {
  return {
    start: { rowId: startRow as RowId, columnId: startCol as ColumnId },
    end: { rowId: endRow as RowId, columnId: endCol as ColumnId },
  }
}

function buildFill(sourceRange: BcRange, targetRow: string, targetCol: string) {
  return buildRangeFill({
    sourceRange,
    target: { rowId: targetRow as RowId, columnId: targetCol as ColumnId },
    columns,
    rowEntries,
    rowIds,
    getSourceValue: (source) => source.row[source.columnId as keyof Row],
  })
}

describe("fill handle", () => {
  test("buildRangeFill extends a numeric sequence down", () => {
    const built = buildFill(range("r1", "amount", "r3", "amount"), "r5", "amount")

    expect(built?.strategy).toBe("linear")
    expect(built?.targetRange).toEqual(range("r1", "amount", "r5", "amount"))
    expect(built?.fillRange).toEqual(range("r4", "amount", "r5", "amount"))
    expect(built?.cells).toEqual([["4"], ["5"]])
    expect(built?.targets.map((target) => [target.rowId, target.columnId, target.value])).toEqual([
      ["r4", "amount", "4"],
      ["r5", "amount", "5"],
    ])
  })

  test("buildRangeFill extends a date sequence down", () => {
    const built = buildFill(range("r1", "due", "r2", "due"), "r4", "due")

    expect(built?.strategy).toBe("linear")
    expect(built?.cells).toEqual([["2026-01-15"], ["2026-01-22"]])
  })

  test("buildRangeFill extends a numeric sequence upward", () => {
    const built = buildFill(range("r3", "amount", "r4", "amount"), "r1", "amount")

    expect(built?.direction).toBe("up")
    expect(built?.cells).toEqual([["1"], ["2"]])
  })

  test("buildRangeFill falls back to copy cycling", () => {
    const built = buildFill(range("r1", "label", "r2", "label"), "r5", "label")

    expect(built?.strategy).toBe("copy")
    expect(built?.cells).toEqual([["A"], ["B"], ["A"]])
  })

  test("targetRangeForFillDrag uses the dominant axis and preserves the source span", () => {
    const preview = targetRangeForFillDrag({
      sourceRange: range("r2", "label", "r3", "amount"),
      target: { rowId: "r5" as RowId, columnId: "due" as ColumnId },
      columns,
      rowIds,
    })

    expect(preview).toEqual(range("r2", "label", "r5", "amount"))
  })

  test("prepareRangeFill applies valueParser before producing commits", async () => {
    const built = buildFill(range("r1", "amount", "r2", "amount"), "r4", "amount")
    if (!built) throw new Error("expected fill")

    const prepared = await prepareRangeFill({
      fill: built,
      getPreviousValue: (target) => target.row.amount,
    })

    expect(prepared.validationErrors).toEqual({})
    expect(prepared.cells.map((cell) => cell.nextValue)).toEqual([3, 4])
    expect(prepared.cells.map((cell) => cell.previousValue)).toEqual([3, 4])
  })

  test("prepareRangeFill applies parsers and rejects the whole fill on validation failure", async () => {
    const built = buildFill(range("r1", "amount", "r2", "amount"), "r5", "amount")
    if (!built) throw new Error("expected fill")

    const prepared = await prepareRangeFill({
      fill: built,
      getPreviousValue: (target) => target.row.amount,
    })

    expect(prepared.cells).toEqual([])
    expect(prepared.validationErrors).toEqual({ "4:0": "Amount must be at most 4." })
  })
})
