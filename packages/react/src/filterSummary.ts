import type { BcColumnFilter, ColumnId } from "@bc-grid/core"
import {
  decodeDateFilterInput,
  decodeDateRangeFilterInput,
  decodeNumberFilterInput,
  decodeNumberRangeFilterInput,
  decodeSetFilterInput,
  decodeTextFilterInput,
} from "./filter"
import { flattenColumnDefinitions } from "./gridInternals"
import type { BcActiveFilterSummaryItem, BcReactGridColumn } from "./types"

export function buildActiveFilterSummaryItems<TRow>(
  columns: readonly BcReactGridColumn<TRow>[],
  columnFilterText: Readonly<Record<ColumnId, string>>,
): readonly BcActiveFilterSummaryItem[] {
  return flattenColumnDefinitions(columns, { includeHidden: true }).flatMap(
    ({ column, columnId }) => {
      if (column.filter === false) return []
      const filterText = columnFilterText[columnId] ?? ""
      if (!isFilterDraftActive(filterText)) return []
      const type = column.filter ? column.filter.type : "text"
      return [
        {
          columnId,
          filterText,
          label: filterSummaryLabel(column, columnId),
          summary: filterSummaryValue(type, filterText),
          type,
        },
      ]
    },
  )
}

export function isFilterDraftActive(value: string): boolean {
  return value.trim().length > 0
}

export function filterSummaryLabel<TRow>(
  column: BcReactGridColumn<TRow>,
  columnId: ColumnId,
): string {
  return typeof column.header === "string" ? column.header : columnId
}

function filterSummaryValue(type: BcColumnFilter["type"], filterText: string): string {
  if (type === "boolean") return filterText === "true" ? "Yes" : "No"
  if (type === "number") {
    const input = decodeNumberFilterInput(filterText)
    if (input.op === "blank") return "Blank"
    if (input.op === "not-blank") return "Not blank"
    if (input.op === "between") return compactRange(input.value, input.valueTo)
    return `${input.op} ${input.value}`.trim()
  }
  if (type === "number-range") {
    const input = decodeNumberRangeFilterInput(filterText)
    return compactRange(input.value, input.valueTo)
  }
  if (type === "date") {
    const input = decodeDateFilterInput(filterText)
    if (input.op === "blank") return "Blank"
    if (input.op === "not-blank") return "Not blank"
    if (input.op === "between") return compactRange(input.value, input.valueTo)
    if (input.op === "last-n-days") return `Last ${input.value} days`.trim()
    if (isDateValueLessSummaryOperator(input.op)) return labelOperator(input.op)
    return `${labelOperator(input.op)} ${input.value}`.trim()
  }
  if (type === "date-range") {
    const input = decodeDateRangeFilterInput(filterText)
    return compactRange(input.value, input.valueTo)
  }
  if (type === "set") {
    const input = decodeSetFilterInput(filterText)
    if (input.op === "blank") return "Blank"
    if (input.op === "not-blank") return "Not blank"
    if (input.op === "current-user") return "Current user"
    if (input.op === "current-team") return "Current team"
    const values = input.values.length > 0 ? input.values.join(", ") : "No values"
    return input.op === "not-in" ? `Not ${values}` : values
  }
  const input = decodeTextFilterInput(filterText)
  if (input.op === "blank") return "Blank"
  if (input.op === "not-blank") return "Not blank"
  if (input.op === "contains") return input.value
  return `${labelOperator(input.op)} ${input.value}`.trim()
}

function compactRange(value: string, valueTo: string | undefined): string {
  if (!value && !valueTo) return ""
  if (!value) return `to ${valueTo ?? ""}`.trim()
  if (!valueTo) return `from ${value}`.trim()
  return `${value} - ${valueTo}`
}

function labelOperator(op: string): string {
  if (op === "does-not-contain") return "Does not contain"
  if (op === "starts-with") return "Starts"
  if (op === "ends-with") return "Ends"
  if (op === "not-equals") return "Not"
  if (op === "current-user") return "Current user"
  if (op === "current-team") return "Current team"
  if (op === "last-n-days") return "Last days"
  if (op === "this-week") return "This week"
  if (op === "last-week") return "Last week"
  if (op === "this-month") return "This month"
  if (op === "last-month") return "Last month"
  if (op === "this-fiscal-quarter") return "This fiscal quarter"
  if (op === "last-fiscal-quarter") return "Last fiscal quarter"
  if (op === "this-fiscal-year") return "This fiscal year"
  if (op === "last-fiscal-year") return "Last fiscal year"
  if (op === "not-blank") return "Not blank"
  return op.charAt(0).toUpperCase() + op.slice(1)
}

function isDateValueLessSummaryOperator(op: string): boolean {
  return (
    op === "today" ||
    op === "yesterday" ||
    op === "this-week" ||
    op === "last-week" ||
    op === "this-month" ||
    op === "last-month" ||
    op === "this-fiscal-quarter" ||
    op === "last-fiscal-quarter" ||
    op === "this-fiscal-year" ||
    op === "last-fiscal-year"
  )
}
