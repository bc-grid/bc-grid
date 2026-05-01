import { describe, expect, test } from "bun:test"
import type { BcRange, ColumnId, RowId } from "@bc-grid/core"
import type { ResolvedColumn, RowEntry } from "../src/gridInternals"
import {
  buildRangeClipboard,
  buildRangeTsvPastePlan,
  cellsToHtmlTable,
  cellsToTsv,
  normaliseClipboardPayload,
  parseRangeTsv,
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

  test("filtered-out range endpoints produce no payload", () => {
    const filteredEntries = [rowEntries[0]]

    expect(
      buildRangeClipboard({
        range: range("r1", "name", "r2", "amount"),
        columns,
        rowEntries: filteredEntries,
        rowIds: filteredEntries.map((entry) => entry.rowId),
        locale: "en-US",
      }),
    ).toBeUndefined()
  })

  test("empty row or column models produce no payload", () => {
    expect(
      buildRangeClipboard({
        range: range("r1", "name", "r2", "amount"),
        columns: [],
        rowEntries,
        rowIds,
        locale: "en-US",
      }),
    ).toBeUndefined()
    expect(
      buildRangeClipboard({
        range: range("r1", "name", "r2", "amount"),
        columns,
        rowEntries: [],
        rowIds: [],
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

describe("range TSV paste helpers", () => {
  test("parseRangeTsv parses a simple row/column matrix", () => {
    expect(parseRangeTsv("A\tB\nC\tD")).toEqual({
      cells: [
        ["A", "B"],
        ["C", "D"],
      ],
      diagnostics: [],
    })
  })

  test("parseRangeTsv preserves quoted tabs, newlines, and escaped quotes", () => {
    const parsed = parseRangeTsv('"A\tB"\t"C\nD"\r\n"E ""quote"""\tF')

    expect(parsed.cells).toEqual([
      ["A\tB", "C\nD"],
      ['E "quote"', "F"],
    ])
    expect(parsed.diagnostics).toEqual([])
  })

  test("parseRangeTsv preserves empty cells, ragged rows, and trailing tabs", () => {
    expect(parseRangeTsv("A\t\tC\n\tB\t\nD").cells).toEqual([["A", "", "C"], ["", "B", ""], ["D"]])
  })

  test("parseRangeTsv drops only the final row created by a trailing row delimiter", () => {
    expect(parseRangeTsv("A\n\nB\n").cells).toEqual([["A"], [""], ["B"]])
  })

  test("parseRangeTsv treats empty clipboard text as a single empty cell", () => {
    expect(parseRangeTsv("")).toEqual({ cells: [[""]], diagnostics: [] })
  })

  test("parseRangeTsv reports malformed quotes without throwing", () => {
    expect(parseRangeTsv('"A\tB').diagnostics).toEqual([
      {
        code: "unterminated-quoted-cell",
        rowIndex: 0,
        columnIndex: 0,
        charIndex: 4,
      },
    ])

    expect(parseRangeTsv('A"B\tC').diagnostics).toEqual([
      {
        code: "unexpected-quote",
        rowIndex: 0,
        columnIndex: 0,
        charIndex: 1,
      },
    ])

    const afterClose = parseRangeTsv('"A"x\tB')
    expect(afterClose.cells).toEqual([["Ax", "B"]])
    expect(afterClose.diagnostics).toEqual([
      {
        code: "unexpected-character-after-closing-quote",
        rowIndex: 0,
        columnIndex: 0,
        charIndex: 3,
      },
    ])
  })

  test("parseRangeTsv handles large payloads with stable matrix shape", () => {
    const input = Array.from({ length: 200 }, (_, rowIndex) =>
      Array.from({ length: 20 }, (_, columnIndex) => `${rowIndex}:${columnIndex}`).join("\t"),
    ).join("\n")
    const parsed = parseRangeTsv(input)

    expect(parsed.diagnostics).toEqual([])
    expect(parsed.cells).toHaveLength(200)
    expect(parsed.cells[0]).toHaveLength(20)
    expect(parsed.cells[199]?.[19]).toBe("199:19")
  })

  test("buildRangeTsvPastePlan maps parsed cells from the anchor", () => {
    const plan = buildRangeTsvPastePlan({
      cells: [
        ["A", "B"],
        ["C", "D"],
      ],
      anchorRowId: "r1" as RowId,
      anchorColumnId: "amount" as ColumnId,
      visibleRowIds: ["r1", "r2", "r3"] as RowId[],
      visibleColumnIds: ["name", "amount", "note"] as ColumnId[],
    })

    expect(plan).toMatchObject({
      anchorRowIndex: 0,
      anchorColumnIndex: 1,
      sourceRowCount: 2,
      sourceColumnCount: 2,
      skippedCells: [],
    })
    expect(plan.targetCells).toEqual([
      {
        sourceRowIndex: 0,
        sourceColumnIndex: 0,
        targetRowIndex: 0,
        targetColumnIndex: 1,
        rowId: "r1",
        columnId: "amount",
        value: "A",
      },
      {
        sourceRowIndex: 0,
        sourceColumnIndex: 1,
        targetRowIndex: 0,
        targetColumnIndex: 2,
        rowId: "r1",
        columnId: "note",
        value: "B",
      },
      {
        sourceRowIndex: 1,
        sourceColumnIndex: 0,
        targetRowIndex: 1,
        targetColumnIndex: 1,
        rowId: "r2",
        columnId: "amount",
        value: "C",
      },
      {
        sourceRowIndex: 1,
        sourceColumnIndex: 1,
        targetRowIndex: 1,
        targetColumnIndex: 2,
        rowId: "r2",
        columnId: "note",
        value: "D",
      },
    ])
  })

  test("buildRangeTsvPastePlan reports out-of-bounds cells without throwing", () => {
    const plan = buildRangeTsvPastePlan({
      cells: [
        ["A", "B"],
        ["C", "D"],
      ],
      anchorRowId: "r2" as RowId,
      anchorColumnId: "note" as ColumnId,
      visibleRowIds: ["r1", "r2"] as RowId[],
      visibleColumnIds: ["name", "amount", "note"] as ColumnId[],
    })

    expect(plan.targetCells).toEqual([
      {
        sourceRowIndex: 0,
        sourceColumnIndex: 0,
        targetRowIndex: 1,
        targetColumnIndex: 2,
        rowId: "r2",
        columnId: "note",
        value: "A",
      },
    ])
    expect(plan.skippedCells).toEqual([
      {
        sourceRowIndex: 0,
        sourceColumnIndex: 1,
        targetRowIndex: 1,
        targetColumnIndex: 3,
        rowId: "r2",
        value: "B",
        reasons: ["column-out-of-bounds"],
      },
      {
        sourceRowIndex: 1,
        sourceColumnIndex: 0,
        targetRowIndex: 2,
        targetColumnIndex: 2,
        columnId: "note",
        value: "C",
        reasons: ["row-out-of-bounds"],
      },
      {
        sourceRowIndex: 1,
        sourceColumnIndex: 1,
        targetRowIndex: 2,
        targetColumnIndex: 3,
        value: "D",
        reasons: ["row-out-of-bounds", "column-out-of-bounds"],
      },
    ])
  })

  test("buildRangeTsvPastePlan reports missing anchors as skipped cells", () => {
    const plan = buildRangeTsvPastePlan({
      cells: [["A"]],
      anchorRowId: "missing-row" as RowId,
      anchorColumnId: "missing-column" as ColumnId,
      visibleRowIds: ["r1"] as RowId[],
      visibleColumnIds: ["name"] as ColumnId[],
    })

    expect(plan.targetCells).toEqual([])
    expect(plan.skippedCells).toEqual([
      {
        sourceRowIndex: 0,
        sourceColumnIndex: 0,
        value: "A",
        reasons: ["anchor-row-not-found", "anchor-column-not-found"],
      },
    ])
  })
})
