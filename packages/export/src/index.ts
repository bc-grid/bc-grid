import type { BcColumnFormat, BcGridColumn } from "@bc-grid/core"

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
}

export interface ExportResult {
  mimeType: string
  extension: string
  content: string | Uint8Array
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

export function toPdf(): never {
  throw new Error(
    "@bc-grid/export.toPdf is reserved for export-pdf-impl and is not implemented yet",
  )
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

async function loadExcelJs(): Promise<typeof import("exceljs")> {
  try {
    return await import("exceljs")
  } catch (error) {
    throw new Error('@bc-grid/export.toExcel requires the optional peer dependency "exceljs"', {
      cause: error,
    })
  }
}
