import { describe, expect, test } from "bun:test"
import type { ColumnId, RowId } from "@bc-grid/core"
import type { ResolvedColumn, RowEntry } from "../src/gridInternals"
import { buildRangePaste, parseClipboardTsv, prepareRangePaste } from "../src/rangePaste"

interface Row {
  id: string
  name: string
  amount: number
  note?: string
}

const columns: ResolvedColumn<Row>[] = [
  resolvedColumn("name", "Name", {
    editable: true,
  }),
  resolvedColumn("amount", "Amount", {
    editable: true,
    valueParser: (input) => Number(input),
    validate: (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? { valid: true }
        : { valid: false, error: "Amount must be non-negative." },
  }),
  resolvedColumn("note", "Note", {
    editable: true,
  }),
]

const rowEntries: RowEntry<Row>[] = [
  dataRow({ id: "r1", name: "Ada", amount: 12, note: "plain" }, 0),
  dataRow({ id: "r2", name: "Grace", amount: 34, note: "line" }, 1),
  {
    kind: "group",
    rowId: "group-region" as RowId,
    index: 2,
    level: 0,
    label: "Region: West",
    childCount: 2,
    childRowIds: ["r1", "r2"] as RowId[],
    expanded: true,
  },
]
const rowIds = rowEntries.map((entry) => entry.rowId)

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

describe("range paste", () => {
  test("parseClipboardTsv handles quoted tabs, quotes, and newlines", () => {
    expect(parseClipboardTsv('"Ada\tLovelace"\t"quote ""x"""\nGrace\t"line\nbreak"')).toEqual([
      ["Ada\tLovelace", 'quote "x"'],
      ["Grace", "line\nbreak"],
    ])
  })

  test("buildRangePaste targets from the anchor and truncates out-of-bounds cells", () => {
    const built = buildRangePaste({
      anchor: { rowId: "r1" as RowId, columnId: "amount" as ColumnId },
      cells: [
        ["1", "A", "extra"],
        ["2", "B", "extra"],
      ],
      columns,
      rowEntries,
      rowIds,
    })

    expect(built?.targetRange).toEqual({
      start: { rowId: "r1", columnId: "amount" },
      end: { rowId: "r2", columnId: "note" },
    })
    expect(built?.truncatedCount).toBe(2)
    expect(built?.targets.map((target) => [target.rowId, target.columnId, target.value])).toEqual([
      ["r1", "amount", "1"],
      ["r1", "note", "A"],
      ["r2", "amount", "2"],
      ["r2", "note", "B"],
    ])
  })

  test("prepareRangePaste applies valueParser and validation before producing commits", async () => {
    const built = buildRangePaste({
      anchor: { rowId: "r1" as RowId, columnId: "amount" as ColumnId },
      cells: [["42"]],
      columns,
      rowEntries,
      rowIds,
    })
    if (!built) throw new Error("expected paste")

    const prepared = await prepareRangePaste({
      paste: built,
      getPreviousValue: (target) => target.row.amount,
    })

    expect(prepared.validationErrors).toEqual({})
    expect(prepared.cells).toHaveLength(1)
    expect(prepared.cells[0]?.nextValue).toBe(42)
    expect(prepared.cells[0]?.previousValue).toBe(12)
  })

  test("prepareRangePaste returns no commits when any target fails validation", async () => {
    const built = buildRangePaste({
      anchor: { rowId: "r1" as RowId, columnId: "amount" as ColumnId },
      cells: [["5"], ["-1"]],
      columns,
      rowEntries,
      rowIds,
    })
    if (!built) throw new Error("expected paste")

    const prepared = await prepareRangePaste({
      paste: built,
      getPreviousValue: (target) => target.row.amount,
    })

    expect(prepared.cells).toEqual([])
    expect(prepared.validationErrors).toEqual({ "1:0": "Amount must be non-negative." })
  })

  test("prepareRangePaste rejects read-only targets", async () => {
    const built = buildRangePaste({
      anchor: { rowId: "r1" as RowId, columnId: "name" as ColumnId },
      cells: [["Ada"]],
      columns,
      rowEntries,
      rowIds,
    })
    if (!built) throw new Error("expected paste")

    const prepared = await prepareRangePaste({
      paste: built,
      getPreviousValue: (target) => target.row.name,
      isEditable: () => false,
    })

    expect(prepared.cells).toEqual([])
    expect(prepared.validationErrors).toEqual({ "0:0": "Cell is read-only." })
  })
})
