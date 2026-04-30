import type {
  BcColumnFormat,
  BcGridColumn,
  ColumnId,
  ServerExportQuery,
  ServerExportResult,
} from "@bc-grid/core"

const DEFAULT_SERVER_EXPORT_MAX_ROWS = 50_000

export interface ExportOptions {
  /** Include a first row of column headers. Default true. */
  includeHeaders?: boolean
  /** Include columns whose `hidden` flag is true. Default false. */
  includeHiddenColumns?: boolean
  /** CSV field delimiter. Default ",". */
  delimiter?: string
  /** CSV row delimiter. Default "\n". */
  lineEnding?: "\n" | "\r\n"
  /** Locale used by preset formatters. */
  locale?: string
  /** Prefix CSV with a UTF-8 BOM for legacy spreadsheet apps. Default false. */
  bom?: boolean
  /** XLSX worksheet name. Default "bc-grid". */
  sheetName?: string
  /** PDF document title metadata. Default "bc-grid export". */
  title?: string
  /** PDF page orientation. Default "landscape". */
  pageOrientation?: "portrait" | "landscape"
}

export interface ExportResult {
  mimeType: string
  extension: string
  content: string | Uint8Array
}

export interface ServerExportContext {
  signal?: AbortSignal
}

export type ServerExportHandler = (
  query: ServerExportQuery,
  context: ServerExportContext,
) => Promise<ServerExportResult>

export type ServerExportRowsResult<TRow> =
  | readonly TRow[]
  | {
      rows: readonly TRow[]
      totalRows?: number
    }

export type LoadAllServerExportRows<TRow> = (
  query: ServerExportQuery,
  context: ServerExportContext,
) => Promise<ServerExportRowsResult<TRow>>

export interface ServerExportFlowOptions<TRow> extends ExportOptions {
  /**
   * Preferred server-owned export path. The server can return a blob,
   * signed URL, or async job id without loading the full dataset in the client.
   */
  exportRows?: ServerExportHandler
  /**
   * Bounded fallback path. The client loads every matching row up to maxRows
   * and serializes it through toCsv / toExcel / toPdf.
   */
  loadAllRows?: LoadAllServerExportRows<TRow>
  /** Abort signal forwarded to either export path. */
  signal?: AbortSignal
  /** Default fallback row cap when query.maxRows is not set. Default 50,000. */
  maxRows?: number
}

export function toCsv<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  options: ExportOptions = {},
): string {
  const delimiter = options.delimiter ?? ","
  if (delimiter.length === 0) {
    throw new Error("@bc-grid/export.toCsv requires a non-empty delimiter")
  }

  const lineEnding = options.lineEnding ?? "\n"
  const visibleColumns = getVisibleColumns(columns, options)
  const outputRows: string[][] = []

  if (options.includeHeaders ?? true) {
    outputRows.push(visibleColumns.map((column) => column.header))
  }

  for (const row of rows) {
    outputRows.push(
      visibleColumns.map((column) => {
        const value = getCellValue(row, column)
        return formatExportValue(value, row, column, options.locale)
      }),
    )
  }

  const csv = outputRows
    .map((row) => row.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter))
    .join(lineEnding)
  return options.bom ? `\uFEFF${csv}` : csv
}

export async function exportServerRows<TRow>(
  query: ServerExportQuery,
  columns: readonly BcGridColumn<TRow>[],
  options: ServerExportFlowOptions<TRow> = {},
): Promise<ServerExportResult> {
  const context: ServerExportContext = options.signal ? { signal: options.signal } : {}
  if (options.exportRows) {
    const serverQuery =
      query.maxRows == null && options.maxRows != null
        ? { ...query, maxRows: options.maxRows }
        : query
    return validateServerExportResult(await options.exportRows(serverQuery, context))
  }

  if (!options.loadAllRows) {
    throw new Error(
      "@bc-grid/export.exportServerRows requires either exportRows or loadAllRows for server-mode exports",
    )
  }

  const maxRows = query.maxRows ?? options.maxRows ?? DEFAULT_SERVER_EXPORT_MAX_ROWS
  const rowsResult = normaliseServerExportRows(
    await options.loadAllRows({ ...query, maxRows }, context),
  )
  assertWithinMaxRows(rowsResult, maxRows)

  return serializeServerExportRows(
    rowsResult.rows,
    columnsForServerExport(query.columns, columns),
    query,
    options,
  )
}

export async function toExcel<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  options: ExportOptions = {},
): Promise<ExportResult> {
  const ExcelJS = await loadExcelJs()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "bc-grid"
  workbook.created = new Date()
  workbook.modified = new Date()

  const visibleColumns = getVisibleColumns(columns, options)
  const worksheet = workbook.addWorksheet(normalizeWorksheetName(options.sheetName))

  visibleColumns.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = excelColumnWidth(column)
  })

  if (options.includeHeaders ?? true) {
    worksheet.addRow(visibleColumns.map((column) => column.header))
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    if (visibleColumns.length > 0) {
      worksheet.views = [{ state: "frozen", ySplit: 1 }]
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: visibleColumns.length },
      }
    }
  }

  for (const row of rows) {
    const excelCells = visibleColumns.map((column) => {
      const value = getCellValue(row, column)
      return toExcelCell(value, row, column, options.locale)
    })
    const worksheetRow = worksheet.addRow(excelCells.map((cell) => cell.value))
    excelCells.forEach((cell, index) => {
      if (cell.numFmt) worksheetRow.getCell(index + 1).numFmt = cell.numFmt
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    content: new Uint8Array(buffer),
  }
}

export async function toPdf<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  options: ExportOptions = {},
): Promise<ExportResult> {
  const { jsPDF } = await loadJsPdf()
  const document = new jsPDF({
    orientation: options.pageOrientation ?? "landscape",
    unit: "pt",
    format: "a4",
    compress: true,
    putOnlyUsedFonts: true,
  })
  document.setProperties({
    title: options.title ?? "bc-grid export",
    creator: "bc-grid",
  })

  const visibleColumns = getVisibleColumns(columns, options)
  const page = pdfPageMetrics(document)
  const columnWidths = pdfColumnWidths(visibleColumns, page.contentWidth)
  let y = page.margin

  const drawHeader = () => {
    if (!(options.includeHeaders ?? true) || visibleColumns.length === 0) return
    y = drawPdfRow(
      document,
      visibleColumns.map((column) => column.header),
      columnWidths,
      y,
      { header: true },
    )
  }

  drawHeader()

  for (const row of rows) {
    const values = visibleColumns.map((column) => {
      const value = getCellValue(row, column)
      return formatExportValue(value, row, column, options.locale)
    })
    const rowHeight = pdfRowHeight(document, values, columnWidths)

    if (y + rowHeight > page.height - page.margin) {
      document.addPage()
      y = page.margin
      drawHeader()
    }

    y = drawPdfRow(document, values, columnWidths, y)
  }

  return {
    mimeType: "application/pdf",
    extension: "pdf",
    content: new Uint8Array(document.output("arraybuffer")),
  }
}

function validateServerExportResult(result: ServerExportResult): ServerExportResult {
  if (result.kind === "blob") {
    if (!result.blob) {
      throw new Error('@bc-grid/export.exportServerRows expected a "blob" result with blob')
    }
    return result
  }
  if (result.kind === "url") {
    if (!result.url) {
      throw new Error('@bc-grid/export.exportServerRows expected a "url" result with url')
    }
    return result
  }
  if (result.kind === "job") {
    if (!result.jobId) {
      throw new Error('@bc-grid/export.exportServerRows expected a "job" result with jobId')
    }
    return result
  }
  throw new Error("@bc-grid/export.exportServerRows expected a blob, url, or job result")
}

function normaliseServerExportRows<TRow>(result: ServerExportRowsResult<TRow>): {
  rows: readonly TRow[]
  totalRows?: number
} {
  if (Array.isArray(result)) return { rows: result }
  const structured = result as { rows: readonly TRow[]; totalRows?: number }
  if (structured.totalRows == null) return { rows: structured.rows }
  return { rows: structured.rows, totalRows: structured.totalRows }
}

function assertWithinMaxRows<TRow>(
  result: { rows: readonly TRow[]; totalRows?: number },
  maxRows: number,
) {
  if (result.totalRows != null && result.totalRows > maxRows) {
    throw new Error(
      `@bc-grid/export.exportServerRows cannot fallback-export ${result.totalRows.toLocaleString()} rows because maxRows is ${maxRows.toLocaleString()}`,
    )
  }
  if (result.rows.length > maxRows) {
    throw new Error(
      `@bc-grid/export.exportServerRows loadAllRows returned ${result.rows.length.toLocaleString()} rows, exceeding maxRows ${maxRows.toLocaleString()}`,
    )
  }
}

async function serializeServerExportRows<TRow>(
  rows: readonly TRow[],
  columns: readonly BcGridColumn<TRow>[],
  query: ServerExportQuery,
  options: ExportOptions,
): Promise<ServerExportResult> {
  if (query.format === "csv") {
    return exportResultToServerBlob({
      mimeType: "text/csv;charset=utf-8",
      extension: "csv",
      content: toCsv(rows, columns, options),
    })
  }
  if (query.format === "xlsx") {
    return exportResultToServerBlob(await toExcel(rows, columns, options))
  }
  return exportResultToServerBlob(await toPdf(rows, columns, options))
}

function exportResultToServerBlob(result: ExportResult): ServerExportResult {
  return {
    kind: "blob",
    blob: new Blob([exportContentBlobPart(result.content)], { type: result.mimeType }),
  }
}

function exportContentBlobPart(content: string | Uint8Array): BlobPart {
  if (typeof content === "string") return content
  const copy = new ArrayBuffer(content.byteLength)
  new Uint8Array(copy).set(content)
  return copy
}

function columnsForServerExport<TRow>(
  columnIds: readonly ColumnId[],
  columns: readonly BcGridColumn<TRow>[],
): BcGridColumn<TRow>[] {
  const byId = new Map<ColumnId, BcGridColumn<TRow>>()
  columns.forEach((column, index) => byId.set(exportColumnId(column, index), column))

  return columnIds.map((columnId) => {
    const column = byId.get(columnId)
    if (!column) {
      throw new Error(`@bc-grid/export.exportServerRows could not find column "${columnId}"`)
    }
    return column
  })
}

function exportColumnId<TRow>(column: BcGridColumn<TRow>, index: number): ColumnId {
  return column.columnId ?? column.field ?? String(index)
}

function getCellValue<TRow>(row: TRow, column: BcGridColumn<TRow>): unknown {
  if (column.valueGetter) return column.valueGetter(row)
  if (!column.field) return undefined
  return (row as Record<string, unknown>)[column.field]
}

function getVisibleColumns<TRow>(
  columns: readonly BcGridColumn<TRow>[],
  options: ExportOptions,
): BcGridColumn<TRow>[] {
  return columns.filter((column) => options.includeHiddenColumns || !column.hidden)
}

function formatExportValue<TRow>(
  value: unknown,
  row: TRow,
  column: BcGridColumn<TRow>,
  locale: string | undefined,
): string {
  if (column.valueFormatter) return column.valueFormatter(value, row)
  if (column.format) return formatPresetValue(value, column.format, locale)
  if (value == null) return ""
  return String(value)
}

function formatPresetValue(
  value: unknown,
  format: BcColumnFormat,
  locale: string | undefined,
): string {
  if (value == null || value === "") {
    return format === "muted" ? "\u2014" : ""
  }

  if (format === "text" || format === "code" || format === "muted") return String(value)
  if (format === "boolean") return value ? "Yes" : "No"
  if (format === "number") return formatNumber(value, locale, {})
  if (format === "currency") return formatCurrency(value, locale)
  if (format === "percent") return formatPercent(value, locale, {})
  if (format === "date") return formatDate(value, locale, { dateStyle: "medium" })
  if (format === "datetime") {
    return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" })
  }

  if (format.type === "number") {
    return formatNumber(value, locale, {
      ...precisionOptions(format.precision),
      useGrouping: format.thousands ?? false,
    })
  }

  if (format.type === "currency") {
    return formatCurrency(value, locale, format.currency, precisionOptions(format.precision))
  }

  if (format.type === "percent") {
    return formatPercent(value, locale, {
      ...precisionOptions(format.precision),
    })
  }

  if (format.type === "date") return formatDate(value, locale, { dateStyle: "medium" })
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" })
}

type ExcelCellValue = import("exceljs").CellValue

interface ExcelCell {
  value: ExcelCellValue
  numFmt?: string
}

function toExcelCell<TRow>(
  value: unknown,
  row: TRow,
  column: BcGridColumn<TRow>,
  locale: string | undefined,
): ExcelCell {
  if (column.valueFormatter) return { value: column.valueFormatter(value, row) }
  if (column.format) return formatExcelPresetValue(value, column.format, locale)
  return { value: defaultExcelValue(value) }
}

function formatExcelPresetValue(
  value: unknown,
  format: BcColumnFormat,
  locale: string | undefined,
): ExcelCell {
  if (value == null || value === "") {
    return { value: format === "muted" ? "\u2014" : null }
  }

  if (format === "text" || format === "code" || format === "muted") return { value: String(value) }
  if (format === "boolean") return { value: Boolean(value) }
  if (format === "number") return excelNumberCell(value, "0")
  if (format === "currency") return excelNumberCell(value, '"USD" #,##0.00')
  if (format === "percent") return excelNumberCell(value, "0%")
  if (format === "date") return excelDateCell(value, "mmm d, yyyy", locale)
  if (format === "datetime") return excelDateCell(value, "mmm d, yyyy h:mm AM/PM", locale)

  if (format.type === "number") {
    return excelNumberCell(value, excelNumberFormat(format.precision, format.thousands ?? false))
  }

  if (format.type === "currency") {
    return excelNumberCell(
      value,
      excelCurrencyFormat(format.currency ?? "USD", format.precision ?? 2),
    )
  }

  if (format.type === "percent") {
    return excelNumberCell(value, excelPercentFormat(format.precision))
  }

  if (format.type === "date") return excelDateCell(value, "mmm d, yyyy", locale)
  return excelDateCell(value, "mmm d, yyyy h:mm AM/PM", locale)
}

function defaultExcelValue(value: unknown): ExcelCellValue {
  if (value == null) return null
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (value instanceof Date) return value
  return String(value)
}

function excelNumberCell(value: unknown, numFmt: string): ExcelCell {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return { value: String(value) }
  return { value: numeric, numFmt }
}

function excelDateCell(value: unknown, numFmt: string, locale: string | undefined): ExcelCell {
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.valueOf()))
    return { value: formatDate(value, locale, { dateStyle: "medium" }) }
  return { value: date, numFmt }
}

function escapeCsvCell(value: string, delimiter: string): string {
  const needsQuoting =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r") ||
    /^\s|\s$/.test(value)
  if (!needsQuoting) return value
  return `"${value.replaceAll('"', '""')}"`
}

function formatNumber(
  value: unknown,
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat(locale, { useGrouping: false, ...options }).format(numeric)
}

function formatCurrency(
  value: unknown,
  locale: string | undefined,
  currency = "USD",
  options: Intl.NumberFormatOptions = {},
): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    ...options,
  }).format(numeric)
}

function formatPercent(
  value: unknown,
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat(locale, {
    style: "percent",
    ...options,
  }).format(numeric)
}

function formatDate(
  value: unknown,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.valueOf())) return String(value)
  return new Intl.DateTimeFormat(locale, options).format(date)
}

function precisionOptions(precision: number | undefined): Intl.NumberFormatOptions {
  if (precision == null) return {}
  return {
    maximumFractionDigits: precision,
    minimumFractionDigits: precision,
  }
}

function excelNumberFormat(precision: number | undefined, thousands: boolean): string {
  const whole = thousands ? "#,##0" : "0"
  return `${whole}${excelDecimalPattern(precision)}`
}

function excelCurrencyFormat(currency: string, precision: number): string {
  return `"${escapeExcelFormatLiteral(currency)}" #,##0${excelDecimalPattern(precision)}`
}

function excelPercentFormat(precision: number | undefined): string {
  return `0${excelDecimalPattern(precision)}%`
}

function excelDecimalPattern(precision: number | undefined): string {
  if (!precision) return ""
  return `.${"0".repeat(precision)}`
}

function escapeExcelFormatLiteral(value: string): string {
  return value.replaceAll('"', '""')
}

function excelColumnWidth<TRow>(column: BcGridColumn<TRow>): number {
  if (column.width) return clamp(Math.round(column.width / 8), 8, 80)
  return clamp(column.header.length + 4, 8, 80)
}

function normalizeWorksheetName(sheetName: string | undefined): string {
  const candidate = (sheetName ?? "bc-grid").replace(/[\\/?*:[\]]/g, " ").trim()
  return (candidate || "bc-grid").slice(0, 31)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

type PdfDocument = InstanceType<typeof import("jspdf").jsPDF>

interface PdfPageMetrics {
  width: number
  height: number
  margin: number
  contentWidth: number
}

const PDF_MARGIN = 36
const PDF_FONT_SIZE = 9
const PDF_HEADER_FONT_SIZE = 9
const PDF_LINE_HEIGHT = 12
const PDF_CELL_PADDING_X = 4
const PDF_CELL_PADDING_Y = 5

function pdfPageMetrics(document: PdfDocument): PdfPageMetrics {
  const width = document.internal.pageSize.getWidth()
  const height = document.internal.pageSize.getHeight()
  return {
    width,
    height,
    margin: PDF_MARGIN,
    contentWidth: width - PDF_MARGIN * 2,
  }
}

function pdfColumnWidths<TRow>(
  columns: readonly BcGridColumn<TRow>[],
  contentWidth: number,
): number[] {
  if (columns.length === 0) return []
  const weights = columns.map((column) => {
    if (column.width) return clamp(column.width / 8, 6, 28)
    return clamp(column.header.length + 2, 6, 28)
  })
  const totalWeight = weights.reduce((total, width) => total + width, 0)
  return weights.map((weight) => (weight / totalWeight) * contentWidth)
}

function pdfRowHeight(
  document: PdfDocument,
  values: readonly string[],
  widths: readonly number[],
): number {
  const lineCounts = values.map((value, index) => {
    const lines = pdfCellLines(document, value, widths[index] ?? 0)
    return Math.max(1, lines.length)
  })
  return Math.max(...lineCounts, 1) * PDF_LINE_HEIGHT + PDF_CELL_PADDING_Y * 2
}

function drawPdfRow(
  document: PdfDocument,
  values: readonly string[],
  widths: readonly number[],
  y: number,
  options: { header?: boolean } = {},
): number {
  const rowHeight = pdfRowHeight(document, values, widths)
  let x = PDF_MARGIN

  document.setFont("helvetica", options.header ? "bold" : "normal")
  document.setFontSize(options.header ? PDF_HEADER_FONT_SIZE : PDF_FONT_SIZE)
  document.setDrawColor(214)
  document.setLineWidth(0.5)

  if (options.header) {
    document.setFillColor(245, 245, 245)
    document.rect(
      PDF_MARGIN,
      y,
      widths.reduce((total, width) => total + width, 0),
      rowHeight,
      "F",
    )
  }

  values.forEach((value, index) => {
    const width = widths[index] ?? 0
    const lines = pdfCellLines(document, value, width)
    document.rect(x, y, width, rowHeight)
    document.text(lines, x + PDF_CELL_PADDING_X, y + PDF_CELL_PADDING_Y + PDF_FONT_SIZE)
    x += width
  })

  return y + rowHeight
}

function pdfCellLines(document: PdfDocument, value: string, width: number): string[] {
  const textWidth = Math.max(1, width - PDF_CELL_PADDING_X * 2)
  const lines = document.splitTextToSize(value || " ", textWidth) as string[]
  return lines.length > 0 ? lines : [" "]
}

async function loadExcelJs(): Promise<typeof import("exceljs")> {
  try {
    return await import("exceljs")
  } catch (error) {
    throw new Error('@bc-grid/export.toExcel requires the optional peer dependency "exceljs"', {
      cause: error,
    })
  }
}

async function loadJsPdf(): Promise<typeof import("jspdf")> {
  try {
    return await import("jspdf")
  } catch (error) {
    throw new Error('@bc-grid/export.toPdf requires the optional peer dependency "jspdf"', {
      cause: error,
    })
  }
}
