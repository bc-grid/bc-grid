import { describe, expect, test } from "bun:test"
import type { BcRange, ColumnId, RowId } from "@bc-grid/core"
import type { ResolvedColumn, RowEntry } from "../src/gridInternals"
import {
  buildRangeClipboard,
  buildRangeTsvPasteApplyPlan,
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

const editableColumns: ResolvedColumn<Row>[] = [
  resolvedColumn("name", "Name", { editable: true }),
  resolvedColumn("amount", "Amount", {
    editable: true,
    valueParser: (input) => {
      if (input === "bad") throw new Error("Amount must be numeric.")
      return Number(input)
    },
    validate: (value) =>
      Number(value) >= 0 ? { valid: true } : { valid: false, error: "Amount must be positive." },
  }),
  resolvedColumn("note", "Note", { editable: true }),
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

  test("parseRangeTsv preserves empty cells and reports ragged rows", () => {
    const parsed = parseRangeTsv("A\t\tC\n\tB\t\nD")

    expect(parsed.cells).toEqual([["A", "", "C"], ["", "B", ""], ["D"]])
    expect(parsed.diagnostics).toEqual([
      {
        code: "ragged-row",
        rowIndex: 2,
        columnIndex: 1,
        charIndex: 10,
        actualColumnCount: 1,
        expectedColumnCount: 3,
      },
    ])
  })

  test("parseRangeTsv drops only the final row created by a trailing row delimiter", () => {
    expect(parseRangeTsv("A\n\nB\n").cells).toEqual([["A"], [""], ["B"]])
  })

  test("parseRangeTsv reports empty clipboard text as a single empty cell diagnostic", () => {
    expect(parseRangeTsv("")).toEqual({
      cells: [[""]],
      diagnostics: [
        {
          code: "empty-paste",
          rowIndex: 0,
          columnIndex: 0,
          charIndex: 0,
        },
      ],
    })
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

  test("parseRangeTsv reports and truncates payloads over the max cell limit", () => {
    const parsed = parseRangeTsv("A\tB\nC\tD", { maxCells: 3 })

    expect(parsed.cells).toEqual([["A", "B"], ["C"]])
    expect(parsed.diagnostics).toEqual([
      {
        code: "max-cell-limit-exceeded",
        rowIndex: 1,
        columnIndex: 1,
        charIndex: 7,
        cellCount: 4,
        maxCells: 3,
      },
      {
        code: "ragged-row",
        rowIndex: 1,
        columnIndex: 1,
        charIndex: 7,
        actualColumnCount: 1,
        expectedColumnCount: 2,
      },
    ])
  })

  test("buildRangeTsvPasteApplyPlan rejects parser diagnostics before producing patches", async () => {
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "name", "r1", "name"),
      tsv: "",
      columns: editableColumns,
      rowEntries,
      rowIds,
    })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "parse-error",
        message: "TSV paste is empty.",
        diagnostic: { code: "empty-paste" },
      },
    })
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

  test("buildRangeTsvPasteApplyPlan returns an atomic rectangular commit plan", async () => {
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "name", "r1", "name"),
      tsv: "Linus\t42\nKatherine\t13",
      columns: editableColumns,
      rowEntries,
      rowIds,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.plan.skippedCells).toEqual([])
    expect(
      result.plan.commits.map((commit) => [commit.rowId, commit.columnId, commit.nextValue]),
    ).toEqual([
      ["r1", "name", "Linus"],
      ["r1", "amount", 42],
      ["r2", "name", "Katherine"],
      ["r2", "amount", 13],
    ])
    expect(result.plan.rowPatches).toEqual([
      {
        rowId: "r1",
        row: rowEntries[0]?.kind === "data" ? rowEntries[0].row : undefined,
        values: { name: "Linus", amount: 42 },
      },
      {
        rowId: "r2",
        row: rowEntries[1]?.kind === "data" ? rowEntries[1].row : undefined,
        values: { name: "Katherine", amount: 13 },
      },
    ])
  })

  test("buildRangeTsvPasteApplyPlan anchors at range start for reversed ranges", async () => {
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r2", "amount", "r1", "name"),
      tsv: "50",
      columns: editableColumns,
      rowEntries,
      rowIds,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.plan.commits).toHaveLength(1)
    expect(result.plan.commits[0]).toMatchObject({
      rowId: "r2",
      columnId: "amount",
      previousValue: 34,
      nextValue: 50,
      rawValue: "50",
    })
  })

  test("buildRangeTsvPasteApplyPlan rejects overflow by default", async () => {
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r2", "note", "r2", "note"),
      tsv: "A\tB\nC\tD",
      columns: editableColumns,
      rowEntries: rowEntries.slice(0, 2),
      rowIds: rowIds.slice(0, 2),
    })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "paste-out-of-bounds",
        sourceRowIndex: 0,
        sourceColumnIndex: 1,
        targetRowIndex: 1,
        targetColumnIndex: 3,
        rowId: "r2",
        rawValue: "B",
      },
    })
  })

  test("buildRangeTsvPasteApplyPlan can clip overflow while preserving skipped metadata", async () => {
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r2", "note", "r2", "note"),
      tsv: "A\tB\nC\tD",
      columns: editableColumns,
      rowEntries: rowEntries.slice(0, 2),
      rowIds: rowIds.slice(0, 2),
      overflow: "clip",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.plan.commits).toHaveLength(1)
    expect(result.plan.commits[0]).toMatchObject({
      rowId: "r2",
      columnId: "note",
      nextValue: "A",
    })
    expect(result.plan.skippedCells.map((cell) => cell.reasons)).toEqual([
      ["column-out-of-bounds"],
      ["row-out-of-bounds"],
      ["row-out-of-bounds", "column-out-of-bounds"],
    ])
  })

  test("buildRangeTsvPasteApplyPlan skips read-only target cells", async () => {
    const readonlyColumns = [
      resolvedColumn("name", "Name", { editable: true }),
      resolvedColumn("amount", "Amount", { editable: false }),
      resolvedColumn("note", "Note", { editable: true }),
    ]
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "name", "r1", "name"),
      tsv: "Linus\t12\tok",
      columns: readonlyColumns,
      rowEntries,
      rowIds,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.plan.commits.map((commit) => [commit.columnId, commit.nextValue])).toEqual([
      ["name", "Linus"],
      ["note", "ok"],
    ])
    expect(result.plan.rowPatches).toEqual([
      {
        rowId: "r1",
        row: rowEntries[0]?.kind === "data" ? rowEntries[0].row : undefined,
        values: { name: "Linus", note: "ok" },
      },
    ])
    expect(result.plan.skippedCells).toEqual([
      {
        sourceRowIndex: 0,
        sourceColumnIndex: 1,
        targetRowIndex: 0,
        targetColumnIndex: 1,
        rowId: "r1",
        columnId: "amount",
        value: "12",
        reasons: ["cell-readonly"],
      },
    ])
  })

  test("buildRangeTsvPasteApplyPlan skips hidden columns while preserving typed values", async () => {
    const hiddenColumns = [
      resolvedColumn("name", "Name", { editable: true }),
      resolvedColumn("note", "Note", { editable: true, hidden: true }),
      resolvedColumn("amount", "Amount", {
        editable: true,
        valueParser: (input) => Number(input),
      }),
    ]
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "name", "r1", "name"),
      tsv: "Ada\thidden\t99",
      columns: hiddenColumns,
      rowEntries,
      rowIds,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.plan.commits.map((commit) => [commit.columnId, commit.nextValue])).toEqual([
      ["name", "Ada"],
      ["amount", 99],
    ])
    expect(result.plan.skippedCells).toMatchObject([
      {
        rowId: "r1",
        columnId: "note",
        value: "hidden",
        reasons: ["column-hidden"],
      },
    ])
  })

  test("buildRangeTsvPasteApplyPlan skips disabled and non-data rows", async () => {
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "name", "r1", "name"),
      tsv: "Linus\nGrace\nGroup",
      columns: editableColumns,
      rowEntries,
      rowIds,
      isRowDisabled: (row) => row.id === "r2",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.plan.commits.map((commit) => [commit.rowId, commit.nextValue])).toEqual([
      ["r1", "Linus"],
    ])
    expect(result.plan.skippedCells.map((cell) => [cell.rowId, cell.value, cell.reasons])).toEqual([
      ["r2", "Grace", ["row-disabled"]],
      ["group-region", "Group", ["row-not-editable"]],
    ])
  })

  test("buildRangeTsvPasteApplyPlan rejects malformed parser diagnostics", async () => {
    const result = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "name", "r1", "name"),
      tsv: '"A',
      columns: editableColumns,
      rowEntries,
      rowIds,
    })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "parse-error",
        sourceRowIndex: 0,
        sourceColumnIndex: 0,
        diagnostic: { code: "unterminated-quoted-cell" },
      },
    })
  })

  test("buildRangeTsvPasteApplyPlan rejects valueParser and validation failures atomically", async () => {
    const parserResult = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "amount", "r1", "amount"),
      tsv: "bad",
      columns: editableColumns,
      rowEntries,
      rowIds,
    })

    expect(parserResult).toMatchObject({
      ok: false,
      error: {
        code: "value-parser-error",
        rowId: "r1",
        columnId: "amount",
        rawValue: "bad",
      },
    })

    const validationResult = await buildRangeTsvPasteApplyPlan({
      range: range("r1", "amount", "r1", "amount"),
      tsv: "-1",
      columns: editableColumns,
      rowEntries,
      rowIds,
    })

    expect(validationResult).toMatchObject({
      ok: false,
      error: {
        code: "validation-error",
        message: "Amount must be positive.",
        rowId: "r1",
        columnId: "amount",
        rawValue: "-1",
      },
    })
  })
})
