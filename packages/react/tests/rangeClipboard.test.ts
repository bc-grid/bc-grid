import { describe, expect, test } from "bun:test"
import type { BcRange, ColumnId, RowId } from "@bc-grid/core"
import type { ResolvedColumn, RowEntry } from "../src/gridInternals"
import {
  buildRangeClipboard,
  cellsToHtmlTable,
  cellsToTsv,
  normaliseClipboardPayload,
} from "../src/rangeClipboard"

interface Row {
  id: string
  name: string
  amount: number
  note?: string
}

const columns: ResolvedColumn<Row>[] = [
  resolvedColumn("name", "Name"),
  resolvedColumn("amount", "Amount", {
    valueFormatter: (value) => `$${value}`,
  }),
  resolvedColumn("note", "Note"),
]

const rowEntries: RowEntry<Row>[] = [
  dataRow({ id: "r1", name: "Ada", amount: 12, note: "plain" }, 0),
  dataRow({ id: "r2", name: "Grace", amount: 34, note: "line\nbreak" }, 1),
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

function range(startRow: string, startCol: string, endRow: string, endCol: string): BcRange {
  return {
    start: { rowId: startRow as RowId, columnId: startCol as ColumnId },
    end: { rowId: endRow as RowId, columnId: endCol as ColumnId },
  }
}

describe("range clipboard", () => {
  test("buildRangeClipboard serializes formatted cells as TSV and HTML", () => {
    const built = buildRangeClipboard({
      range: range("r1", "name", "r2", "note"),
      columns,
      rowEntries,
      rowIds,
      locale: "en-US",
    })

    expect(built?.rows.map((row) => row.id)).toEqual(["r1", "r2"])
    expect(built?.payload.tsv).toBe('Ada\t$12\tplain\nGrace\t$34\t"line\nbreak"')
    expect(built?.payload.html).toBe(
      "<table><tbody><tr><td>Ada</td><td>$12</td><td>plain</td></tr><tr><td>Grace</td><td>$34</td><td>line\nbreak</td></tr></tbody></table>",
    )
  })

  test("buildRangeClipboard can prepend headers and resolves reversed ranges", () => {
    const built = buildRangeClipboard({
      range: range("r2", "amount", "r1", "name"),
      columns,
      rowEntries,
      rowIds,
      locale: "en-US",
      includeHeaders: true,
    })

    expect(built?.payload.tsv).toBe("Name\tAmount\nAda\t$12\nGrace\t$34")
  })

  test("group rows serialize their label in the first copied column", () => {
    const built = buildRangeClipboard({
      range: range("group-region", "name", "group-region", "amount"),
      columns,
      rowEntries,
      rowIds,
      locale: "en-US",
    })

    expect(built?.rows).toEqual([])
    expect(built?.payload.tsv).toBe("Region: West\t")
  })

  test("stale range endpoints produce no payload", () => {
    expect(
      buildRangeClipboard({
        range: range("missing", "name", "r1", "amount"),
        columns,
        rowEntries,
        rowIds,
        locale: "en-US",
      }),
    ).toBeUndefined()
  })

  test("normaliseClipboardPayload builds HTML when a hook supplies TSV only", () => {
    expect(normaliseClipboardPayload({ tsv: 'A\t"B"\nC\tD' }).html).toBe(
      "<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>",
    )
  })

  test("cell serializers escape delimiters and HTML", () => {
    expect(cellsToTsv([["a\tb", 'c"d']])).toBe('"a\tb"\t"c""d"')
    expect(cellsToHtmlTable([["<Ada>", "Grace & Hopper"]])).toBe(
      "<table><tbody><tr><td>&lt;Ada&gt;</td><td>Grace &amp; Hopper</td></tr></tbody></table>",
    )
  })
})
