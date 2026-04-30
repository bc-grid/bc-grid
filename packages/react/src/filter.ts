import type {
  BcColumnFilter,
  BcGridFilter,
  ColumnId,
  ServerColumnFilter,
  ServerFilter,
} from "@bc-grid/core"

/**
 * Internal column-filter state held by `<BcGrid>`. One entry per column
 * with a non-empty filter input. Map keys are `ColumnId`s; values are
 * the raw string the user typed.
 *
 * Lives outside the React component so the filter algebra is unit-
 * testable without a DOM.
 */
export type ColumnFilterText = Readonly<Record<ColumnId, string>>
export type ColumnFilterTypeByColumnId = Readonly<Record<ColumnId, BcColumnFilter["type"]>>
export type DateFilterOperator = "is" | "before" | "after" | "between"
export type NumberFilterOperator = "=" | "!=" | "<" | "<=" | ">" | ">=" | "between"

export interface DateFilterInput {
  op: DateFilterOperator
  value: string
  valueTo?: string
}

export interface NumberFilterInput {
  op: NumberFilterOperator
  value: string
  valueTo?: string
}

/**
 * Two-input min/max filter for `BcColumnFilter.type === "number-range"`.
 * Convenience over `number` `between` per `filter-registry-rfc §number-range`:
 * always emits `op: "between"` so the predicate path collapses into the
 * existing `matchesNumberFilter` between branch.
 */
export interface NumberRangeFilterInput {
  value: string
  valueTo: string
}

export type FilterCellValue =
  | string
  | {
      formattedValue: string
      rawValue?: unknown
    }

type DateColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & { type: "date" }
type NumberColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & { type: "number" }
type NumberRangeColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & {
  type: "number-range"
}

/**
 * Convert per-column filter-control values into the canonical `BcGridFilter`
 * (= `ServerFilter`) shape from `@bc-grid/core`. Returns `null` when
 * every input is empty (no filter active). Single non-empty input
 * returns a bare `ServerColumnFilter`; multiple inputs AND together
 * inside a `ServerFilterGroup`.
 */
export function buildGridFilter(
  text: ColumnFilterText,
  filterTypes: ColumnFilterTypeByColumnId = {},
): BcGridFilter | null {
  const filters: ServerColumnFilter[] = []
  for (const [columnId, raw] of Object.entries(text)) {
    const value = raw.trim()
    if (value.length === 0) continue
    const filterType = filterTypes[columnId] ?? "text"
    if (filterType === "boolean") {
      if (value !== "true" && value !== "false") continue
      filters.push({ kind: "column", columnId, type: "boolean", op: "is", value: value === "true" })
      continue
    }
    if (filterType === "number") {
      const parsed = parseNumberFilterInput(value)
      if (!parsed) continue
      filters.push({ ...parsed, columnId })
      continue
    }
    if (filterType === "number-range") {
      const parsed = parseNumberRangeFilterInput(value)
      if (!parsed) continue
      filters.push({ ...parsed, columnId })
      continue
    }
    if (filterType === "date") {
      const parsed = parseDateFilterInput(value)
      if (!parsed) continue
      filters.push({ ...parsed, columnId })
      continue
    }
    filters.push({ kind: "column", columnId, type: "text", op: "contains", value })
  }
  if (filters.length === 0) return null
  if (filters.length === 1 && filters[0]) return filters[0]
  return { kind: "group", op: "and", filters }
}

/**
 * Test whether a single formatted cell value matches a column filter.
 * Unsupported types / ops fall through to "no match" so new public API
 * shapes can be introduced intentionally.
 */
function matchesColumnFilter(cellValue: FilterCellValue, filter: ServerColumnFilter): boolean {
  const value = normaliseFilterCellValue(cellValue)
  if (filter.type === "boolean") {
    if (filter.op !== "is") return false
    const actual = parseFormattedBoolean(value.formattedValue)
    return actual != null && actual === Boolean(filter.value)
  }
  if (filter.type === "number") {
    return matchesNumberFilter(value.formattedValue, filter)
  }
  if (filter.type === "number-range") {
    // The number-range filter always emits op="between"; the predicate
    // path is identical to `number`'s between branch.
    return matchesNumberFilter(value.formattedValue, filter)
  }
  if (filter.type === "date") {
    return matchesDateFilter(value, filter)
  }
  if (filter.type !== "text") return false
  if (filter.op !== "contains") return false
  const needle = String(filter.value ?? "").toLowerCase()
  if (needle.length === 0) return true
  return value.formattedValue.toLowerCase().includes(needle)
}

/**
 * Test whether a row matches a `BcGridFilter` tree. Recursive over
 * group `op: "and"` / `op: "or"`. The caller supplies a per-column
 * `formattedValue` lookup (we use the column's `valueFormatter` so
 * filter results match what the user *sees*, not the raw value).
 */
export function matchesGridFilter(
  filter: BcGridFilter,
  valueByColumnId: (columnId: ColumnId) => FilterCellValue,
): boolean {
  if (filter.kind === "column") {
    return matchesColumnFilter(valueByColumnId(filter.columnId), filter)
  }
  if (filter.op === "and") {
    return filter.filters.every((child: ServerFilter) => matchesGridFilter(child, valueByColumnId))
  }
  return filter.filters.some((child: ServerFilter) => matchesGridFilter(child, valueByColumnId))
}

function normaliseFilterCellValue(value: FilterCellValue): {
  formattedValue: string
  rawValue?: unknown
} {
  return typeof value === "string" ? { formattedValue: value } : value
}

function parseFormattedBoolean(value: string): boolean | null {
  const normalised = value.trim().toLowerCase()
  if (normalised === "yes" || normalised === "true" || normalised === "1") return true
  if (normalised === "no" || normalised === "false" || normalised === "0") return false
  return null
}

export function encodeNumberFilterInput(input: NumberFilterInput): string {
  return JSON.stringify(input)
}

export const encodeDateFilterInput = encodeNumberFilterInput as (input: DateFilterInput) => string

export function encodeNumberRangeFilterInput(input: NumberRangeFilterInput): string {
  return JSON.stringify(input)
}

export function decodeNumberRangeFilterInput(raw: string): NumberRangeFilterInput {
  try {
    const parsed = JSON.parse(raw) as Partial<NumberRangeFilterInput>
    return {
      value: typeof parsed.value === "string" ? parsed.value : "",
      valueTo: typeof parsed.valueTo === "string" ? parsed.valueTo : "",
    }
  } catch {
    return { value: "", valueTo: "" }
  }
}

export function decodeDateFilterInput(raw: string): DateFilterInput {
  try {
    const parsed = JSON.parse(raw) as Partial<DateFilterInput>
    return normaliseDateFilterInput(parsed)
  } catch {
    return { op: "is", value: "" }
  }
}

export function decodeNumberFilterInput(raw: string): NumberFilterInput {
  try {
    const parsed = JSON.parse(raw) as Partial<NumberFilterInput>
    return normaliseNumberFilterInput(parsed)
  } catch {
    return { op: "=", value: "" }
  }
}

function parseDateFilterInput(raw: string): DateColumnFilterDraft | null {
  const input = decodeDateFilterInput(raw)
  const value = parseFilterDate(input.value)
  if (!value) return null

  if (input.op === "between") {
    const valueTo = parseFilterDate(input.valueTo ?? "")
    if (!valueTo) return null
    const min = value <= valueTo ? value : valueTo
    const max = value <= valueTo ? valueTo : value
    return {
      kind: "column",
      type: "date",
      op: "between",
      values: [min, max],
    }
  }

  return {
    kind: "column",
    type: "date",
    op: input.op,
    value,
  }
}

function parseNumberFilterInput(raw: string): NumberColumnFilterDraft | null {
  const input = decodeNumberFilterInput(raw)
  const value = parseFilterNumber(input.value)
  if (value == null) return null

  if (input.op === "between") {
    const valueTo = parseFilterNumber(input.valueTo ?? "")
    if (valueTo == null) return null
    const min = Math.min(value, valueTo)
    const max = Math.max(value, valueTo)
    return {
      kind: "column",
      type: "number",
      op: "between",
      values: [min, max],
    }
  }

  return {
    kind: "column",
    type: "number",
    op: input.op,
    value,
  }
}

/**
 * Parse a `number-range` filter draft into the canonical `between`
 * `ServerColumnFilter` shape. Both inputs must be finite numbers; if
 * either is missing or unparseable, the filter is dropped (treated as
 * "not yet active") so partial typing doesn't narrow the row set.
 * Swapped min/max are normalised so consumers can type either edge
 * first.
 */
function parseNumberRangeFilterInput(raw: string): NumberRangeColumnFilterDraft | null {
  const input = decodeNumberRangeFilterInput(raw)
  const lo = parseFilterNumber(input.value)
  const hi = parseFilterNumber(input.valueTo)
  if (lo == null || hi == null) return null
  const min = Math.min(lo, hi)
  const max = Math.max(lo, hi)
  return {
    kind: "column",
    type: "number-range",
    op: "between",
    values: [min, max],
  }
}

function normaliseDateFilterInput(input: Partial<DateFilterInput>): DateFilterInput {
  const op = isDateFilterOperator(input.op) ? input.op : "is"
  return {
    op,
    value: typeof input.value === "string" ? input.value : "",
    ...(op === "between"
      ? { valueTo: typeof input.valueTo === "string" ? input.valueTo : "" }
      : {}),
  }
}

function normaliseNumberFilterInput(input: Partial<NumberFilterInput>): NumberFilterInput {
  const op = isNumberFilterOperator(input.op) ? input.op : "="
  return {
    op,
    value: typeof input.value === "string" ? input.value : "",
    ...(op === "between"
      ? { valueTo: typeof input.valueTo === "string" ? input.valueTo : "" }
      : {}),
  }
}

function matchesDateFilter(
  cellValue: { formattedValue: string; rawValue?: unknown },
  filter: ServerColumnFilter,
): boolean {
  const actual = parseFilterDate(cellValue.rawValue) ?? parseFilterDate(cellValue.formattedValue)
  if (!actual) return false

  if (filter.op === "between") {
    const [firstRaw, secondRaw] = filter.values ?? []
    const first = parseFilterDate(firstRaw)
    const second = parseFilterDate(secondRaw)
    if (!first || !second) return false
    const min = first <= second ? first : second
    const max = first <= second ? second : first
    return actual >= min && actual <= max
  }

  const expected = parseFilterDate(filter.value)
  if (!expected) return false
  if (filter.op === "is") return actual === expected
  if (filter.op === "before") return actual < expected
  if (filter.op === "after") return actual > expected
  return false
}

function matchesNumberFilter(formattedValue: string, filter: ServerColumnFilter): boolean {
  const actual = parseFormattedNumber(formattedValue)
  if (actual == null) return false

  if (filter.op === "between") {
    const values = filter.values?.map((value) => Number(value)).filter(Number.isFinite) ?? []
    if (values.length < 2) return false
    const min = Math.min(values[0] ?? 0, values[1] ?? 0)
    const max = Math.max(values[0] ?? 0, values[1] ?? 0)
    return actual >= min && actual <= max
  }

  const expected = Number(filter.value)
  if (!Number.isFinite(expected)) return false
  if (filter.op === "=") return actual === expected
  if (filter.op === "!=") return actual !== expected
  if (filter.op === "<") return actual < expected
  if (filter.op === "<=") return actual <= expected
  if (filter.op === ">") return actual > expected
  if (filter.op === ">=") return actual >= expected
  return false
}

function parseFormattedNumber(value: string): number | null {
  const cleaned = value.trim().replace(/[^0-9.+\-Ee]/g, "")
  return parseFilterNumber(cleaned)
}

function parseFilterDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) return null
    return toDateInputValue(value)
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null
    return toDateInputValue(new Date(value))
  }
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return null
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(trimmed)
  if (isoDate) return normaliseDateParts(isoDate[1], isoDate[2], isoDate[3])

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.valueOf())) return null
  return toDateInputValue(parsed)
}

function normaliseDateParts(
  yearPart: string | undefined,
  monthPart: string | undefined,
  dayPart: string | undefined,
): string | null {
  const year = Number(yearPart)
  const month = Number(monthPart)
  const day = Number(dayPart)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  ) {
    return `${yearPart}-${monthPart}-${dayPart}`
  }
  return null
}

function parseFilterNumber(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const numeric = Number(trimmed)
  return Number.isFinite(numeric) ? numeric : null
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isDateFilterOperator(value: unknown): value is DateFilterOperator {
  return value === "is" || value === "before" || value === "after" || value === "between"
}

function isNumberFilterOperator(value: unknown): value is NumberFilterOperator {
  return (
    value === "=" ||
    value === "!=" ||
    value === "<" ||
    value === "<=" ||
    value === ">" ||
    value === ">=" ||
    value === "between"
  )
}
