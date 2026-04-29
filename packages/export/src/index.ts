import type { BcColumnFormat, BcGridColumn } from "@bc-grid/core"

export interface ExportOptions {
  /** Include a first row of column headers. Default true. */
  includeHeaders?: boolean
  /** Include columns whose `hidden` flag is true. Default false. */
  includeHiddenColumns?: boolean
  /** Field delimiter. Default ",". */
  delimiter?: string
  /** Row delimiter. Default "\n". */
  lineEnding?: "\n" | "\r\n"
  /** Locale used by preset formatters. */
  locale?: string
  /** Prefix the CSV with a UTF-8 BOM for legacy spreadsheet apps. Default false. */
  bom?: boolean
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
  const visibleColumns = columns.filter((column) => options.includeHiddenColumns || !column.hidden)
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

export function toExcel(): never {
  throw new Error(
    "@bc-grid/export.toExcel is reserved for export-xlsx-impl and is not implemented yet",
  )
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
