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
    html: payload.html ?? cellsToHtmlTable(parseTsv(payload.tsv)),
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

export function parseTsv(tsv: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  for (let index = 0; index < tsv.length; index += 1) {
    const char = tsv[index]
    const next = tsv[index + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === "\t") {
      row.push(cell)
      cell = ""
    } else if (char === "\n") {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else if (char !== "\r") {
      cell += char
    }
  }

  row.push(cell)
  rows.push(row)
  return rows
}
