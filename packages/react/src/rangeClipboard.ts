import type { BcRange, ColumnId, RowId } from "@bc-grid/core"
import type { RowEntry } from "./gridInternals"
import { type ResolvedColumn, isDataRowEntry } from "./gridInternals"
import type { BcClipboardPayload } from "./types"
import { formatCellValue, getCellValue } from "./value"

export interface BuiltRangeClipboard<TRow> {
  range: BcRange
  rows: readonly TRow[]
  payload: BcClipboardPayload
}

interface BuildRangeClipboardParams<TRow> {
  range: BcRange
  columns: readonly ResolvedColumn<TRow>[]
  rowEntries: readonly RowEntry<TRow>[]
  rowIds: readonly RowId[]
  locale: string | undefined
  includeHeaders?: boolean
}

export type RangeTsvParseDiagnosticCode =
  | "unexpected-quote"
  | "unexpected-character-after-closing-quote"
  | "unterminated-quoted-cell"

export interface RangeTsvParseDiagnostic {
  code: RangeTsvParseDiagnosticCode
  rowIndex: number
  columnIndex: number
  charIndex: number
}

export interface RangeTsvParseResult {
  cells: string[][]
  diagnostics: RangeTsvParseDiagnostic[]
}

export interface BuildRangeTsvPastePlanParams {
  cells: readonly (readonly string[])[]
  anchorRowId: RowId
  anchorColumnId: ColumnId
  visibleRowIds: readonly RowId[]
  visibleColumnIds: readonly ColumnId[]
}

export type RangeTsvPasteSkipReason =
  | "anchor-row-not-found"
  | "anchor-column-not-found"
  | "row-out-of-bounds"
  | "column-out-of-bounds"

export interface RangeTsvPasteTargetCell {
  sourceRowIndex: number
  sourceColumnIndex: number
  targetRowIndex: number
  targetColumnIndex: number
  rowId: RowId
  columnId: ColumnId
  value: string
}

export interface RangeTsvPasteSkippedCell {
  sourceRowIndex: number
  sourceColumnIndex: number
  targetRowIndex?: number
  targetColumnIndex?: number
  rowId?: RowId
  columnId?: ColumnId
  value: string
  reasons: RangeTsvPasteSkipReason[]
}

export interface RangeTsvPastePlan {
  anchorRowId: RowId
  anchorColumnId: ColumnId
  anchorRowIndex: number
  anchorColumnIndex: number
  sourceRowCount: number
  sourceColumnCount: number
  targetCells: RangeTsvPasteTargetCell[]
  skippedCells: RangeTsvPasteSkippedCell[]
}

export function buildRangeClipboard<TRow>({
  range,
  columns,
  rowEntries,
  rowIds,
  locale,
  includeHeaders = false,
}: BuildRangeClipboardParams<TRow>): BuiltRangeClipboard<TRow> | undefined {
  const bounds = resolveRangeBounds(range, columns, rowIds)
  if (!bounds) return undefined

  const cells: string[][] = []
  if (includeHeaders) {
    cells.push(
      columns.slice(bounds.colStart, bounds.colEnd + 1).map((column) => headerText(column)),
    )
  }

  const rows: TRow[] = []
  for (let rowIndex = bounds.rowStart; rowIndex <= bounds.rowEnd; rowIndex += 1) {
    const entry = rowEntries[rowIndex]
    if (entry && isDataRowEntry(entry)) rows.push(entry.row)
    const rowCells: string[] = []
    for (let colIndex = bounds.colStart; colIndex <= bounds.colEnd; colIndex += 1) {
      const column = columns[colIndex]
      rowCells.push(formatClipboardCell(entry, column, locale, colIndex === bounds.colStart))
    }
    cells.push(rowCells)
  }

  return {
    range,
    rows,
    payload: {
      html: cellsToHtmlTable(cells),
      tsv: cellsToTsv(cells),
    },
  }
}

export async function writeClipboardPayload(payload: BcClipboardPayload): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard
  if (!clipboard) throw new Error("Clipboard API is not available")

  const normalised = normaliseClipboardPayload(payload)
  if (typeof ClipboardItem !== "undefined" && typeof clipboard.write === "function") {
    const items: Record<string, Blob> = {
      "text/plain": new Blob([normalised.tsv], { type: "text/plain" }),
      "text/html": new Blob([normalised.html ?? ""], { type: "text/html" }),
    }
    for (const [type, value] of Object.entries(normalised.custom ?? {})) {
      items[type] = new Blob([value], { type })
    }
    await clipboard.write([new ClipboardItem(items)])
    return
  }

  if (typeof clipboard.writeText === "function") {
    await clipboard.writeText(normalised.tsv)
    return
  }

  throw new Error("Clipboard write is not available")
}

export function normaliseClipboardPayload(payload: BcClipboardPayload): BcClipboardPayload {
  return {
    ...payload,
    html: payload.html ?? cellsToHtmlTable(parseRangeTsv(payload.tsv).cells),
  }
}

export function cellsToTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeTsvCell).join("\t")).join("\n")
}

export function cellsToHtmlTable(rows: readonly (readonly string[])[]): string {
  const body = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")
  return `<table><tbody>${body}</tbody></table>`
}

/**
 * Parse spreadsheet-style TSV clipboard text into a row/column matrix.
 *
 * Supported input matches the practical Excel / Google Sheets subset: tabs
 * split cells, CRLF/LF/CR split rows, quoted cells may contain tabs/newlines,
 * and doubled quotes inside quoted cells unescape to a single quote. Malformed
 * quote usage is parsed best-effort and returned as diagnostics so future paste
 * code can reject or warn without this helper throwing.
 */
export function parseRangeTsv(input: string): RangeTsvParseResult {
  const cells: string[][] = []
  const diagnostics: RangeTsvParseDiagnostic[] = []
  let row: string[] = []
  let cell = ""
  let inQuotes = false
  let afterClosingQuote = false
  let endedWithRowDelimiter = false

  const currentColumnIndex = () => row.length
  const pushDiagnostic = (code: RangeTsvParseDiagnosticCode, charIndex: number) => {
    diagnostics.push({
      code,
      rowIndex: cells.length,
      columnIndex: currentColumnIndex(),
      charIndex,
    })
  }
  const finishCell = () => {
    row.push(cell)
    cell = ""
    inQuotes = false
    afterClosingQuote = false
    endedWithRowDelimiter = false
  }
  const finishRow = () => {
    row.push(cell)
    cells.push(row)
    row = []
    cell = ""
    inQuotes = false
    afterClosingQuote = false
    endedWithRowDelimiter = true
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const next = input[index + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
        afterClosingQuote = true
      } else {
        cell += char
      }
      continue
    }

    if (char === "\t") {
      finishCell()
      continue
    }

    if (char === "\n" || char === "\r") {
      finishRow()
      if (char === "\r" && next === "\n") index += 1
      continue
    }

    if (afterClosingQuote) {
      pushDiagnostic("unexpected-character-after-closing-quote", index)
      afterClosingQuote = false
      cell += char
      continue
    }

    if (char === '"') {
      if (cell.length === 0) {
        inQuotes = true
      } else {
        pushDiagnostic("unexpected-quote", index)
        cell += char
      }
      endedWithRowDelimiter = false
      continue
    }

    cell += char
    endedWithRowDelimiter = false
  }

  if (inQuotes) {
    pushDiagnostic("unterminated-quoted-cell", input.length)
  }

  if (!endedWithRowDelimiter || row.length > 0 || cell.length > 0) {
    row.push(cell)
    cells.push(row)
  }

  return { cells, diagnostics }
}

export function buildRangeTsvPastePlan({
  cells,
  anchorRowId,
  anchorColumnId,
  visibleRowIds,
  visibleColumnIds,
}: BuildRangeTsvPastePlanParams): RangeTsvPastePlan {
  const anchorRowIndex = visibleRowIds.indexOf(anchorRowId)
  const anchorColumnIndex = visibleColumnIds.indexOf(anchorColumnId)
  const targetCells: RangeTsvPasteTargetCell[] = []
  const skippedCells: RangeTsvPasteSkippedCell[] = []
  const sourceColumnCount = cells.reduce((max, row) => Math.max(max, row.length), 0)

  for (const [sourceRowIndex, sourceRow] of cells.entries()) {
    for (const [sourceColumnIndex, value] of sourceRow.entries()) {
      const targetRowIndex = anchorRowIndex >= 0 ? anchorRowIndex + sourceRowIndex : undefined
      const targetColumnIndex =
        anchorColumnIndex >= 0 ? anchorColumnIndex + sourceColumnIndex : undefined
      const rowId = targetRowIndex === undefined ? undefined : visibleRowIds[targetRowIndex]
      const columnId =
        targetColumnIndex === undefined ? undefined : visibleColumnIds[targetColumnIndex]
      const reasons: RangeTsvPasteSkipReason[] = []

      if (anchorRowIndex < 0) reasons.push("anchor-row-not-found")
      else if (rowId === undefined) reasons.push("row-out-of-bounds")

      if (anchorColumnIndex < 0) reasons.push("anchor-column-not-found")
      else if (columnId === undefined) reasons.push("column-out-of-bounds")

      if (reasons.length > 0) {
        const skippedCell: RangeTsvPasteSkippedCell = {
          sourceRowIndex,
          sourceColumnIndex,
          value,
          reasons,
        }
        if (targetRowIndex !== undefined) skippedCell.targetRowIndex = targetRowIndex
        if (targetColumnIndex !== undefined) {
          skippedCell.targetColumnIndex = targetColumnIndex
        }
        if (rowId !== undefined) skippedCell.rowId = rowId
        if (columnId !== undefined) skippedCell.columnId = columnId
        skippedCells.push(skippedCell)
        continue
      }

      targetCells.push({
        sourceRowIndex,
        sourceColumnIndex,
        targetRowIndex: targetRowIndex as number,
        targetColumnIndex: targetColumnIndex as number,
        rowId: rowId as RowId,
        columnId: columnId as ColumnId,
        value,
      })
    }
  }

  return {
    anchorRowId,
    anchorColumnId,
    anchorRowIndex,
    anchorColumnIndex,
    sourceRowCount: cells.length,
    sourceColumnCount,
    targetCells,
    skippedCells,
  }
}

function formatClipboardCell<TRow>(
  entry: RowEntry<TRow> | undefined,
  column: ResolvedColumn<TRow> | undefined,
  locale: string | undefined,
  firstSelectedColumn: boolean,
): string {
  if (!entry || !column) return ""
  if (!isDataRowEntry(entry)) return firstSelectedColumn ? entry.label : ""
  const value = getCellValue(entry.row, column.source)
  return formatCellValue(value, entry.row, column.source, locale)
}

function headerText<TRow>(column: ResolvedColumn<TRow>): string {
  const header = column.source.header
  if (typeof header === "string") return header
  if (column.source.field) return column.source.field
  return String(column.columnId)
}

function resolveRangeBounds(
  range: BcRange,
  columns: readonly { columnId: ColumnId }[],
  rowIds: readonly RowId[],
):
  | {
      rowStart: number
      rowEnd: number
      colStart: number
      colEnd: number
    }
  | undefined {
  const startRow = rowIds.indexOf(range.start.rowId)
  const endRow = rowIds.indexOf(range.end.rowId)
  const startCol = columns.findIndex((column) => column.columnId === range.start.columnId)
  const endCol = columns.findIndex((column) => column.columnId === range.end.columnId)
  if (startRow < 0 || endRow < 0 || startCol < 0 || endCol < 0) return undefined
  return {
    rowStart: Math.min(startRow, endRow),
    rowEnd: Math.max(startRow, endRow),
    colStart: Math.min(startCol, endCol),
    colEnd: Math.max(startCol, endCol),
  }
}

function escapeTsvCell(value: string): string {
  if (!/["\t\r\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
