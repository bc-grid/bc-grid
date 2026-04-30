import type { BcColumnFormat } from "@bc-grid/core"
import type { BcReactGridColumn } from "./types"

export function getCellValue<TRow>(row: TRow, column: BcReactGridColumn<TRow, unknown>): unknown {
  if (column.valueGetter) return column.valueGetter(row)
  if (!column.field) return undefined
  return (row as Record<string, unknown>)[column.field]
}

export function formatCellValue<TRow>(
  value: unknown,
  row: TRow,
  column: BcReactGridColumn<TRow, unknown>,
  locale: string | undefined,
): string {
  if (column.valueFormatter) return column.valueFormatter(value, row)
  if (column.format) return formatPresetValue(value, column.format, locale)
  if (value == null) return ""
  return String(value)
}

export function formatPresetValue(
  value: unknown,
  format: BcColumnFormat,
  locale: string | undefined,
): string {
  if (value == null || value === "") {
    return format === "muted" ? "\u2014" : ""
  }

  if (format === "text" || format === "code") return String(value)
  if (format === "muted") return String(value)
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
