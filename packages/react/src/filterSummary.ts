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
  if (op === "starts-with") return "Starts"
  if (op === "ends-with") return "Ends"
  if (op === "not-blank") return "Not blank"
  return op.charAt(0).toUpperCase() + op.slice(1)
}
