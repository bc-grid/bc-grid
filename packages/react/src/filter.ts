import type {
  BcColumnFilter,
  BcGridFilter,
  ColumnId,
  ServerColumnFilter,
  ServerFilter,
  SetFilterOption,
  SetFilterOptionLoadParams,
  SetFilterOptionLoadResult,
} from "@bc-grid/core"
import {
  columnFilterFromSerializedCriteria,
  matchesColumnFilter as matchesRegisteredColumnFilter,
  matchesFilter as matchesRegisteredFilter,
  serializeColumnFilterCriteria,
} from "@bc-grid/filters"
import type { BcFilterPredicateContext } from "@bc-grid/filters"
import { reportUnknownFilterDefinition } from "./filterRegistry"

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
export type DateFilterOperator =
  | "is"
  | "not-equals"
  | "before"
  | "after"
  | "between"
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "last-n-days"
  | "this-month"
  | "last-month"
  | "this-fiscal-quarter"
  | "last-fiscal-quarter"
  | "this-fiscal-year"
  | "last-fiscal-year"
  | "blank"
  | "not-blank"
export type NumberFilterOperator =
  | "="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "between"
  | "blank"
  | "not-blank"
export type SetFilterOperator =
  | "in"
  | "not-in"
  | "blank"
  | "not-blank"
  | "current-user"
  | "current-team"
/**
 * Operator surface for `BcColumnFilter.type === "text"` per
 * `filter-registry-rfc §text`. The `regex` modifier is a separate
 * boolean toggle that, when on, causes the predicate to interpret
 * `value` as a `RegExp` pattern (operator-agnostic — `op` is ignored
 * for matching because regex patterns describe their own anchoring).
 */
export type TextFilterOperator =
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with"
  | "equals"
  | "not-equals"
  | "current-user"
  | "current-team"
  | "blank"
  | "not-blank"

export interface TextFilterInput {
  op: TextFilterOperator
  value: string
  /** Default false (case-insensitive). */
  caseSensitive?: boolean
  /** Default false. When true, `value` is a regex pattern. */
  regex?: boolean
}

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

/**
 * Two-input from/to filter for `BcColumnFilter.type === "date-range"`.
 * Convenience over `date` `between` per `filter-registry-rfc §date-range`:
 * always emits `op: "between"` so the predicate path collapses into the
 * existing `matchesDateFilter` between branch. ISO 8601 (yyyy-mm-dd)
 * day-precision strings, sourced directly from `<input type="date">`.
 */
export interface DateRangeFilterInput {
  value: string
  valueTo: string
}

export interface SetFilterInput {
  op: SetFilterOperator
  values: readonly string[]
}

export type SetFilterOptionLoaderParams = Omit<SetFilterOptionLoadParams, "filterWithoutSelf">

export type SetFilterOptionLoader = (
  params: SetFilterOptionLoaderParams,
) => Promise<SetFilterOptionLoadResult>

export type FilterCellValue =
  | string
  | {
      formattedValue: string
      rawValue?: unknown
    }

type TextColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & { type: "text" }
type DateColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & { type: "date" }
type DateRangeColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & {
  type: "date-range"
}
type NumberColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & { type: "number" }
type NumberRangeColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & {
  type: "number-range"
}
type SetColumnFilterDraft = Omit<ServerColumnFilter, "columnId"> & { type: "set" }

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
    if (filterType === "date-range") {
      const parsed = parseDateRangeFilterInput(value)
      if (!parsed) continue
      filters.push({ ...parsed, columnId })
      continue
    }
    if (filterType === "set") {
      const parsed = parseSetFilterInput(value)
      if (!parsed) continue
      filters.push({ ...parsed, columnId })
      continue
    }
    if (filterType === "text") {
      const parsed = parseTextFilterInput(value)
      if (!parsed) continue
      filters.push({ ...parsed, columnId })
      continue
    }
    const parsed = columnFilterFromSerializedCriteria({
      columnId,
      serialized: value,
      type: filterType,
    })
    if (parsed) filters.push(parsed)
    else reportUnknownFilterDefinition(filterType, `column "${columnId}" filter state`)
  }
  if (filters.length === 0) return null
  if (filters.length === 1 && filters[0]) return filters[0]
  return { kind: "group", op: "and", filters }
}

export function columnFilterTextFromGridFilter(
  filter: BcGridFilter | null | undefined,
): ColumnFilterText {
  if (!filter) return {}
  const text: Record<ColumnId, string> = {}
  assignColumnFilterText(filter, text)
  return text
}

export function columnFilterTextEqual(left: ColumnFilterText, right: ColumnFilterText): boolean {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) return false
  return leftKeys.every((key) => left[key] === right[key])
}

/**
 * Walk a `BcGridFilter` and return a copy with every column-leaf
 * targeting `columnId` removed. A group whose children are all
 * removed collapses to `null`; a group with a single remaining child
 * collapses to that child. Returns `null` when the input filter has
 * no entries left.
 *
 * Pure: never mutates the input. Used by `BcGridApi.clearFilter` to
 * implement "clear filter for this column" without touching the
 * other columns' filter state. Per `docs/design/context-menu-
 * command-map.md §2.3`.
 */
export function removeColumnFromFilter(
  filter: BcGridFilter | null | undefined,
  columnId: ColumnId,
): BcGridFilter | null {
  if (!filter) return null
  return removeColumnFromServerFilter(filter, columnId)
}

export function filterForColumn(
  filter: BcGridFilter | null | undefined,
  columnId: ColumnId,
): BcGridFilter | null {
  if (!filter) return null
  return pickColumnFromServerFilter(filter, columnId)
}

function removeColumnFromServerFilter(
  filter: ServerFilter,
  columnId: ColumnId,
): ServerFilter | null {
  if (filter.kind === "column") {
    return filter.columnId === columnId ? null : filter
  }
  const next = filter.filters
    .map((child) => removeColumnFromServerFilter(child, columnId))
    .filter((child): child is ServerFilter => child !== null)
  if (next.length === 0) return null
  if (next.length === 1 && next[0]) return next[0]
  return { kind: "group", op: filter.op, filters: next }
}

function pickColumnFromServerFilter(filter: ServerFilter, columnId: ColumnId): ServerFilter | null {
  if (filter.kind === "column") {
    return filter.columnId === columnId ? filter : null
  }
  const next = filter.filters
    .map((child) => pickColumnFromServerFilter(child, columnId))
    .filter((child): child is ServerFilter => child !== null)
  if (next.length === 0) return null
  if (next.length === 1 && next[0]) return next[0]
  return { kind: "group", op: filter.op, filters: next }
}

/**
 * Read whether a `BcGridFilter` carries any column-leaf targeting
 * `columnId`. Used by the `clear-column-filter` context-menu item's
 * disabled-state predicate so the menu shows the affordance disabled
 * when there's nothing to clear for the right-clicked column.
 */
export function filterHasColumn(
  filter: BcGridFilter | null | undefined,
  columnId: ColumnId,
): boolean {
  if (!filter) return false
  return serverFilterHasColumn(filter, columnId)
}

function serverFilterHasColumn(filter: ServerFilter, columnId: ColumnId): boolean {
  if (filter.kind === "column") return filter.columnId === columnId
  return filter.filters.some((child) => serverFilterHasColumn(child, columnId))
}

function assignColumnFilterText(filter: ServerFilter, text: Record<ColumnId, string>): void {
  if (filter.kind === "group") {
    if (filter.op !== "and") return
    for (const child of filter.filters) assignColumnFilterText(child, text)
    return
  }

  const encoded = encodeColumnFilterInput(filter)
  if (encoded !== undefined) text[filter.columnId] = encoded
}

function encodeColumnFilterInput(filter: ServerColumnFilter): string | undefined {
  if (filter.type === "boolean") {
    if (filter.op !== "is" || typeof filter.value !== "boolean") return undefined
    return String(filter.value)
  }

  if (filter.type === "number") {
    if (!isNumberFilterOperator(filter.op)) return undefined
    if (filter.op === "blank" || filter.op === "not-blank") {
      return encodeNumberFilterInput({ op: filter.op, value: "" })
    }
    if (filter.op === "between") {
      const values = numberFilterValuePair(filter.values)
      return values ? encodeNumberFilterInput({ op: "between", ...values }) : undefined
    }
    const value = scalarFilterInputValue(filter.value)
    return value ? encodeNumberFilterInput({ op: filter.op, value }) : undefined
  }

  if (filter.type === "number-range") {
    if (filter.op !== "between") return undefined
    const values = numberFilterValuePair(filter.values)
    return values ? encodeNumberRangeFilterInput(values) : undefined
  }

  if (filter.type === "date") {
    if (!isDateFilterOperator(filter.op)) return undefined
    if (filter.op === "blank" || filter.op === "not-blank") {
      return encodeDateFilterInput({ op: filter.op, value: "" })
    }
    if (isDateValueLessFilterOperator(filter.op)) {
      return encodeDateFilterInput({ op: filter.op, value: "" })
    }
    if (filter.op === "last-n-days") {
      const value = scalarFilterInputValue(filter.value)
      return value ? encodeDateFilterInput({ op: "last-n-days", value }) : undefined
    }
    if (filter.op === "between") {
      const values = dateFilterValuePair(filter.values)
      return values ? encodeDateFilterInput({ op: "between", ...values }) : undefined
    }
    const value = dateFilterInputValue(filter.value)
    return value ? encodeDateFilterInput({ op: filter.op, value }) : undefined
  }

  if (filter.type === "date-range") {
    if (filter.op !== "between") return undefined
    const values = dateFilterValuePair(filter.values)
    return values ? encodeDateRangeFilterInput(values) : undefined
  }

  if (filter.type === "set") {
    if (
      filter.op === "blank" ||
      filter.op === "not-blank" ||
      filter.op === "current-user" ||
      filter.op === "current-team"
    ) {
      return encodeSetFilterInput({ op: filter.op, values: [] })
    }
    if (filter.op !== "in" && filter.op !== "not-in") return undefined
    const values = Array.isArray(filter.values)
      ? filter.values.filter((value): value is string => typeof value === "string")
      : []
    return values.length > 0 ? encodeSetFilterInput({ op: filter.op, values }) : undefined
  }

  if (filter.type !== "text") {
    const encoded = serializeColumnFilterCriteria(filter)
    if (encoded === undefined) {
      reportUnknownFilterDefinition(filter.type, `column "${filter.columnId}" filter projection`)
    }
    return encoded
  }
  // Default `contains` filter with no modifier flags serialises as a
  // plain string for legacy round-trip. Anything non-default emits the
  // JSON-encoded TextFilterInput so the editor restores op + modifier
  // flags faithfully.
  const op = isTextFilterOperator(filter.op) ? filter.op : "contains"
  if (isTextValueLessFilterOperator(op)) return encodeTextFilterInput({ op, value: "" })
  const value = scalarFilterInputValue(filter.value)
  if (!value || value.trim().length === 0) return undefined
  const caseSensitive = filter.caseSensitive === true
  const regex = filter.regex === true
  if (op === "contains" && !caseSensitive && !regex) return value
  return encodeTextFilterInput({
    op,
    value,
    ...(caseSensitive ? { caseSensitive: true } : {}),
    ...(regex ? { regex: true } : {}),
  })
}

/**
 * Test whether a single formatted cell value matches a column filter.
 * Unsupported types / ops fall through to "no match" so new public API
 * shapes can be introduced intentionally.
 */
export function matchesColumnFilter(
  cellValue: FilterCellValue,
  filter: ServerColumnFilter,
  options: { context?: BcFilterPredicateContext | undefined } = {},
): boolean {
  const value = normaliseFilterCellValue(cellValue)
  if (filter.type === "boolean") {
    if (filter.op === "blank") return isBlankFilterCellValue(value)
    if (filter.op === "not-blank") return !isBlankFilterCellValue(value)
    if (filter.op !== "is") return false
    const actual = parseFormattedBoolean(value.formattedValue)
    return actual != null && actual === Boolean(filter.value)
  }
  if (filter.type === "number") {
    return matchesNumberFilter(value, filter)
  }
  if (filter.type === "number-range") {
    // The number-range filter always emits op="between"; the predicate
    // path is identical to `number`'s between branch.
    return matchesNumberFilter(value, filter)
  }
  if (filter.type === "date") {
    return matchesDateFilter(value, filter, options.context)
  }
  if (filter.type === "date-range") {
    // The date-range filter always emits op="between"; the predicate
    // path is identical to `date`'s between branch.
    return matchesDateFilter(value, filter, options.context)
  }
  if (filter.type === "set") {
    return matchesSetFilter(value, filter, options.context)
  }
  if (filter.type !== "text") return false
  return matchesTextFilter(value, filter, options.context)
}

/**
 * Predicate for the `text` filter type. Switches on the operator
 * (`contains` default, plus `starts-with` / `ends-with` / `equals`)
 * and applies the `caseSensitive` and `regex` modifier flags. When
 * `regex` is on the operator is ignored — regex patterns describe
 * their own anchoring, so applying op semantics on top would surprise
 * users who wrote `^foo$` and selected `contains`. A regex that fails
 * to compile drops the filter (no match) — defense-in-depth alongside
 * the build-time guard in parseTextFilterInput.
 */
function matchesTextFilter(
  cellValue: { formattedValue: string; rawValue?: unknown },
  filter: ServerColumnFilter,
  context: BcFilterPredicateContext | undefined,
): boolean {
  if (filter.op === "blank") return isBlankFilterCellValue(cellValue)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(cellValue)
  if (filter.op === "current-user" || filter.op === "current-team") {
    return matchesRegisteredColumnFilter(cellValue, filter, { context })
  }
  const formattedValue = cellValue.formattedValue
  const needleRaw = String(filter.value ?? "")
  if (needleRaw.length === 0) return true

  if (filter.regex === true) {
    try {
      const pattern = new RegExp(needleRaw, filter.caseSensitive === true ? "" : "i")
      const matched = pattern.test(formattedValue)
      return filter.op === "not-equals" || filter.op === "does-not-contain" ? !matched : matched
    } catch {
      return false
    }
  }

  const caseSensitive = filter.caseSensitive === true
  const haystack = caseSensitive ? formattedValue : formattedValue.toLowerCase()
  const needle = caseSensitive ? needleRaw : needleRaw.toLowerCase()
  if (!isTextFilterOperator(filter.op)) return false
  if (filter.op === "current-user" || filter.op === "current-team") return false
  if (filter.op === "starts-with") return haystack.startsWith(needle)
  if (filter.op === "ends-with") return haystack.endsWith(needle)
  if (filter.op === "equals") return haystack === needle
  if (filter.op === "not-equals") return haystack !== needle
  if (filter.op === "does-not-contain") return !haystack.includes(needle)
  return haystack.includes(needle)
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
  options: { context?: BcFilterPredicateContext | undefined } = {},
): boolean {
  return matchesRegisteredFilter(filter, valueByColumnId, {
    context: options.context,
    onUnknownFilter: (type, columnFilter) =>
      reportUnknownFilterDefinition(type, `column "${columnFilter.columnId}" predicate`),
  })
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

export function encodeTextFilterInput(input: TextFilterInput): string {
  return JSON.stringify(input)
}

/**
 * Decode the editor's serialised text-filter state. Falls back to the
 * legacy plain-string contract (`raw` taken as a `contains` needle) so
 * filter inputs typed before this rescue — and persisted payloads that
 * pre-date it — still resolve. Default op is `contains` per
 * `filter-registry-rfc §text`.
 */
export function decodeTextFilterInput(raw: string): TextFilterInput {
  try {
    const parsed = JSON.parse(raw) as Partial<TextFilterInput>
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.value === "string" &&
      isTextFilterOperator(parsed.op)
    ) {
      const out: TextFilterInput = { op: parsed.op, value: parsed.value }
      if (parsed.caseSensitive === true) out.caseSensitive = true
      if (parsed.regex === true) out.regex = true
      return out
    }
  } catch {
    // fall through to the plain-string contract.
  }
  return { op: "contains", value: raw }
}

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

export function encodeDateRangeFilterInput(input: DateRangeFilterInput): string {
  return JSON.stringify(input)
}

export function decodeDateRangeFilterInput(raw: string): DateRangeFilterInput {
  try {
    const parsed = JSON.parse(raw) as Partial<DateRangeFilterInput>
    return {
      value: typeof parsed.value === "string" ? parsed.value : "",
      valueTo: typeof parsed.valueTo === "string" ? parsed.valueTo : "",
    }
  } catch {
    return { value: "", valueTo: "" }
  }
}

export function encodeSetFilterInput(input: SetFilterInput): string {
  return JSON.stringify(input)
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

export function decodeSetFilterInput(raw: string): SetFilterInput {
  try {
    const parsed = JSON.parse(raw) as Partial<SetFilterInput>
    return normaliseSetFilterInput(parsed)
  } catch {
    return { op: "in", values: [] }
  }
}

/**
 * Filter the set-filter option list by a search query, matching against
 * either the label or the underlying value (case-insensitive). Empty /
 * whitespace-only queries pass every option through unchanged. Pure so
 * the menu's narrowing behaviour stays unit-testable without rendering
 * the full SetFilterControl.
 */
export function filterSetFilterOptions(
  options: readonly SetFilterOption[],
  searchQuery: string,
): SetFilterOption[] {
  const trimmed = searchQuery.trim().toLocaleLowerCase()
  if (trimmed.length === 0) return [...options]
  return options.filter((option) => {
    return (
      option.label.toLocaleLowerCase().includes(trimmed) ||
      option.value.toLocaleLowerCase().includes(trimmed)
    )
  })
}

export function normaliseSetFilterOption(input: string | SetFilterOption): SetFilterOption | null {
  if (typeof input === "string") {
    const value = setFilterValueKeys(input)[0]
    return value ? { value, label: value } : null
  }
  const value = setFilterValueKeys(input.value)[0]
  if (!value) return null
  const label = input.label.trim().length > 0 ? input.label : value
  return { value, label }
}

export function normaliseSetFilterOptions(
  options: readonly (string | SetFilterOption)[],
): SetFilterOption[] {
  const byValue = new Map<string, SetFilterOption>()
  for (const optionInput of options) {
    const option = normaliseSetFilterOption(optionInput)
    if (!option || byValue.has(option.value)) continue
    byValue.set(option.value, option)
  }
  return Array.from(byValue.values())
}

export function buildSetFilterOptionLoadResult(
  options: readonly (string | SetFilterOption)[],
  params: Pick<SetFilterOptionLoadParams, "limit" | "offset" | "search" | "selectedValues">,
): SetFilterOptionLoadResult {
  const normalised = normaliseSetFilterOptions(options)
  const filtered = filterSetFilterOptions(normalised, params.search)
  const offset = Math.max(0, Math.floor(params.offset))
  const limit = Math.max(0, Math.floor(params.limit))
  const pagedOptions = limit === 0 ? [] : filtered.slice(offset, offset + limit)
  const byValue = new Map(normalised.map((option) => [option.value, option]))
  const selectedOptions = normaliseSetFilterOptions(
    params.selectedValues.map((value) => byValue.get(value) ?? { value, label: value }),
  )

  return {
    options: pagedOptions,
    totalCount: filtered.length,
    selectedOptions,
    hasMore: offset + pagedOptions.length < filtered.length,
  }
}

/**
 * Compute the next selection set when the user toggles "select all".
 * "All" here means the currently visible (search-narrowed) options
 * only — selections for options hidden by the active search query are
 * preserved, so typing in the search box never silently unselects
 * off-screen choices. If every visible option is already selected the
 * call clears them; otherwise it adds the missing ones.
 */
export function nextSetFilterValuesOnToggleAll(
  visibleOptions: readonly SetFilterOption[],
  currentValues: readonly string[],
): string[] {
  const selected = new Set(currentValues)
  const visibleValues = visibleOptions.map((option) => option.value)
  const allVisibleSelected =
    visibleValues.length > 0 && visibleValues.every((value) => selected.has(value))
  if (allVisibleSelected) {
    const visibleSet = new Set(visibleValues)
    return currentValues.filter((value) => !visibleSet.has(value))
  }
  const additions = visibleValues.filter((value) => !selected.has(value))
  return [...currentValues, ...additions]
}

/**
 * Parse a `text` filter draft into the canonical `ServerColumnFilter`
 * shape. Trims the value at the build boundary so a whitespace-only
 * input drops the filter (consistent with the rest of buildGridFilter).
 * Regex patterns that fail to compile drop the filter so partial typing
 * of an unfinished pattern doesn't blank out the row set. Modifier
 * flags are emitted only when non-default to keep the canonical shape
 * minimal and the persistence round-trip tight.
 */
function parseTextFilterInput(raw: string): TextColumnFilterDraft | null {
  const input = decodeTextFilterInput(raw)
  if (isTextValueLessFilterOperator(input.op)) {
    return {
      kind: "column",
      type: "text",
      op: input.op,
    }
  }
  const value = input.value.trim()
  if (!value) return null

  if (input.regex === true) {
    try {
      new RegExp(value, input.caseSensitive === true ? "" : "i")
    } catch {
      return null
    }
  }

  const draft: TextColumnFilterDraft = {
    kind: "column",
    type: "text",
    op: input.op,
    value,
  }
  if (input.caseSensitive === true) draft.caseSensitive = true
  if (input.regex === true) draft.regex = true
  return draft
}

function parseDateFilterInput(raw: string): DateColumnFilterDraft | null {
  const input = decodeDateFilterInput(raw)
  if (input.op === "blank" || input.op === "not-blank") {
    return {
      kind: "column",
      type: "date",
      op: input.op,
    }
  }
  if (isDateValueLessFilterOperator(input.op)) {
    return {
      kind: "column",
      type: "date",
      op: input.op,
    }
  }
  if (input.op === "last-n-days") {
    const days = parsePositiveIntegerInput(input.value)
    if (days == null) return null
    return {
      kind: "column",
      type: "date",
      op: "last-n-days",
      value: days,
    }
  }
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
  if (input.op === "blank" || input.op === "not-blank") {
    return {
      kind: "column",
      type: "number",
      op: input.op,
    }
  }
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

/**
 * Parse a `date-range` filter draft into the canonical `between`
 * `ServerColumnFilter` shape. Both inputs must parse to ISO 8601 dates;
 * if either is missing or unparseable, the filter is dropped (treated as
 * "not yet active") so partial typing doesn't narrow the row set.
 * Swapped from/to are normalised so consumers can type either edge
 * first. Lexical ISO comparison is sufficient because dates are
 * `YYYY-MM-DD`.
 */
function parseDateRangeFilterInput(raw: string): DateRangeColumnFilterDraft | null {
  const input = decodeDateRangeFilterInput(raw)
  const lo = parseFilterDate(input.value)
  const hi = parseFilterDate(input.valueTo)
  if (!lo || !hi) return null
  const min = lo <= hi ? lo : hi
  const max = lo <= hi ? hi : lo
  return {
    kind: "column",
    type: "date-range",
    op: "between",
    values: [min, max],
  }
}

function parseSetFilterInput(raw: string): SetColumnFilterDraft | null {
  const input = decodeSetFilterInput(raw)

  if (
    input.op === "blank" ||
    input.op === "not-blank" ||
    input.op === "current-user" ||
    input.op === "current-team"
  ) {
    return {
      kind: "column",
      type: "set",
      op: input.op,
    }
  }

  if (input.values.length === 0) return null
  return {
    kind: "column",
    type: "set",
    op: input.op,
    values: [...input.values],
  }
}

function scalarFilterInputValue(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}

function numberFilterValuePair(
  values: readonly unknown[] | undefined,
): NumberRangeFilterInput | undefined {
  if (!Array.isArray(values) || values.length < 2) return undefined
  const value = scalarFilterInputValue(values[0])
  const valueTo = scalarFilterInputValue(values[1])
  return value && valueTo ? { value, valueTo } : undefined
}

function dateFilterInputValue(value: unknown): string | undefined {
  return parseFilterDate(value) ?? undefined
}

function dateFilterValuePair(
  values: readonly unknown[] | undefined,
): DateRangeFilterInput | undefined {
  if (!Array.isArray(values) || values.length < 2) return undefined
  const value = dateFilterInputValue(values[0])
  const valueTo = dateFilterInputValue(values[1])
  return value && valueTo ? { value, valueTo } : undefined
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

function normaliseSetFilterInput(input: Partial<SetFilterInput>): SetFilterInput {
  const op = isSetFilterOperator(input.op) ? input.op : "in"
  const values = Array.isArray(input.values)
    ? Array.from(new Set(input.values.flatMap(setFilterValueKeys)))
    : []
  return { op, values }
}

function matchesDateFilter(
  cellValue: { formattedValue: string; rawValue?: unknown },
  filter: ServerColumnFilter,
  context: BcFilterPredicateContext | undefined,
): boolean {
  if (filter.op === "blank") return isBlankFilterCellValue(cellValue)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(cellValue)
  if (
    isDateValueLessFilterOperator(filter.op as DateFilterOperator) ||
    filter.op === "last-n-days"
  ) {
    return matchesRegisteredColumnFilter(cellValue, filter, { context })
  }
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
  if (filter.op === "not-equals") return actual !== expected
  if (filter.op === "before") return actual < expected
  if (filter.op === "after") return actual > expected
  return false
}

function matchesSetFilter(
  cellValue: { formattedValue: string; rawValue?: unknown },
  filter: ServerColumnFilter,
  context: BcFilterPredicateContext | undefined,
): boolean {
  if (filter.op === "blank") return isBlankSetFilterCellValue(cellValue)
  if (filter.op === "not-blank") return !isBlankSetFilterCellValue(cellValue)
  if (filter.op === "current-user" || filter.op === "current-team") {
    return matchesRegisteredColumnFilter(cellValue, filter, { context })
  }

  const selected = new Set((filter.values ?? []).flatMap(setFilterValueKeys))
  if (selected.size === 0) return true

  const candidates = setFilterCandidateValues(cellValue)
  const hasMatch = candidates.some((value) => selected.has(value))
  if (filter.op === "in") return hasMatch
  if (filter.op === "not-in") return !hasMatch
  return false
}

function matchesNumberFilter(
  cellValue: { formattedValue: string; rawValue?: unknown } | string,
  filter: ServerColumnFilter,
): boolean {
  const value =
    typeof cellValue === "string"
      ? ({ formattedValue: cellValue } as { formattedValue: string; rawValue?: unknown })
      : cellValue
  if (filter.op === "blank") return isBlankFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(value)
  const actual = parseFormattedNumber(value.formattedValue)
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

export function setFilterValueKey(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) return ""
    return toDateInputValue(value)
  }
  return String(value ?? "")
}

export function setFilterValueKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.flatMap(setFilterValueKeys)))
  }
  if (typeof value === "string" && value.trim().length === 0) return []

  const key = setFilterValueKey(value)
  return key.length > 0 ? [key] : []
}

export function isBlankSetFilterValue(value: unknown): boolean {
  if (Array.isArray(value)) return setFilterValueKeys(value).length === 0
  if (value == null) return true
  if (typeof value === "string") return value.trim().length === 0
  return false
}

function isBlankFilterCellValue(value: { formattedValue: string; rawValue?: unknown }): boolean {
  if ("rawValue" in value) {
    const raw = value.rawValue
    if (raw == null) return true
    if (typeof raw === "string") return raw.trim().length === 0
    return false
  }
  return value.formattedValue.trim().length === 0
}

function isBlankSetFilterCellValue(value: { formattedValue: string; rawValue?: unknown }): boolean {
  if ("rawValue" in value) return isBlankSetFilterValue(value.rawValue)
  return value.formattedValue.trim().length === 0
}

function setFilterCandidateValues(value: { formattedValue: string; rawValue?: unknown }): string[] {
  const candidates: string[] = []
  if ("rawValue" in value) {
    for (const rawKey of setFilterValueKeys(value.rawValue)) {
      if (!candidates.includes(rawKey)) candidates.push(rawKey)
    }
    if (Array.isArray(value.rawValue)) return candidates
  }

  const formattedKey = setFilterValueKey(value.formattedValue)
  if (formattedKey.length > 0 && !candidates.includes(formattedKey)) {
    candidates.push(formattedKey)
  }

  return candidates
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

function parsePositiveIntegerInput(value: string): number | null {
  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isDateFilterOperator(value: unknown): value is DateFilterOperator {
  return (
    value === "is" ||
    value === "not-equals" ||
    value === "before" ||
    value === "after" ||
    value === "between" ||
    value === "today" ||
    value === "yesterday" ||
    value === "this-week" ||
    value === "last-week" ||
    value === "last-n-days" ||
    value === "this-month" ||
    value === "last-month" ||
    value === "this-fiscal-quarter" ||
    value === "last-fiscal-quarter" ||
    value === "this-fiscal-year" ||
    value === "last-fiscal-year" ||
    value === "blank" ||
    value === "not-blank"
  )
}

function isDateValueLessFilterOperator(value: DateFilterOperator): boolean {
  return (
    value === "today" ||
    value === "yesterday" ||
    value === "this-week" ||
    value === "last-week" ||
    value === "this-month" ||
    value === "last-month" ||
    value === "this-fiscal-quarter" ||
    value === "last-fiscal-quarter" ||
    value === "this-fiscal-year" ||
    value === "last-fiscal-year"
  )
}

function isNumberFilterOperator(value: unknown): value is NumberFilterOperator {
  return (
    value === "=" ||
    value === "!=" ||
    value === "<" ||
    value === "<=" ||
    value === ">" ||
    value === ">=" ||
    value === "between" ||
    value === "blank" ||
    value === "not-blank"
  )
}

function isTextFilterOperator(value: unknown): value is TextFilterOperator {
  return (
    value === "contains" ||
    value === "does-not-contain" ||
    value === "starts-with" ||
    value === "ends-with" ||
    value === "equals" ||
    value === "not-equals" ||
    value === "current-user" ||
    value === "current-team" ||
    value === "blank" ||
    value === "not-blank"
  )
}

function isTextValueLessFilterOperator(value: TextFilterOperator): boolean {
  return (
    value === "blank" ||
    value === "not-blank" ||
    value === "current-user" ||
    value === "current-team"
  )
}

function isSetFilterOperator(value: unknown): value is SetFilterOperator {
  return (
    value === "in" ||
    value === "not-in" ||
    value === "blank" ||
    value === "not-blank" ||
    value === "current-user" ||
    value === "current-team"
  )
}
