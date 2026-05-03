import type { ColumnId, ServerColumnFilter, ServerFilter } from "@bc-grid/core"

export type BcFilterCellValue<TValue = unknown> =
  | string
  | {
      formattedValue: string
      rawValue?: TValue
    }

export interface BcFilterPredicateValue<TValue = unknown> {
  formattedValue: string
  rawValue?: TValue
}

export type BcFilterOperatorValueShape =
  | "none"
  | "single"
  | "range"
  | "multi"
  | "integer"
  | "context"

export interface BcFilterOperatorDefinition {
  op: string
  label: string
  valueShape: BcFilterOperatorValueShape
  serverHint?: string
}

export interface BcFiscalCalendar {
  /**
   * 1-based month where the fiscal year starts. Defaults to January.
   */
  startMonth?: number
  /**
   * 1-based day of the start month. Defaults to 1.
   */
  startDay?: number
}

export interface BcFilterUserContext {
  id?: string | number
  teamIds?: readonly (string | number)[]
}

export interface BcFilterPredicateContext {
  now?: Date | string | number
  /**
   * 0 = Sunday, 1 = Monday. Defaults to Monday for ERP work-week filters.
   */
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6
  fiscalCalendar?: BcFiscalCalendar
  user?: BcFilterUserContext
}

export interface BcFilterDefinition<TValue = unknown> {
  type: string
  operators?: readonly BcFilterOperatorDefinition[]
  predicate: (
    value: BcFilterPredicateValue<TValue>,
    criteria: unknown,
    ctx: BcFilterPredicateContext,
  ) => boolean
  serialize: (criteria: unknown) => string
  parse: (serialized: string) => unknown
  criteriaFromFilter?: (filter: ServerColumnFilter) => unknown
  filterFromCriteria?: (
    criteria: unknown,
  ) => (Partial<Omit<ServerColumnFilter, "kind" | "columnId" | "type">> & { op: string }) | null
}

export interface BcFilterRegistry {
  register(definition: BcFilterDefinition): void
  get(type: string): BcFilterDefinition | undefined
  has(type: string): boolean
  entries(): BcFilterDefinition[]
}

export interface MatchesFilterOptions {
  registry?: BcFilterRegistry
  context?: BcFilterPredicateContext | undefined
  onUnknownFilter?: (type: string, filter: ServerColumnFilter) => void
}

export class BcDefaultFilterRegistry implements BcFilterRegistry {
  private readonly definitions = new Map<string, BcFilterDefinition>()

  constructor(definitions: readonly BcFilterDefinition[] = []) {
    for (const definition of definitions) this.register(definition)
  }

  register(definition: BcFilterDefinition): void {
    const type = definition.type.trim()
    if (!type) throw new Error("Filter definition type must be a non-empty string.")
    if (this.definitions.has(type)) {
      throw new Error(`Filter definition "${type}" is already registered.`)
    }
    this.definitions.set(type, { ...definition, type })
  }

  get(type: string): BcFilterDefinition | undefined {
    return this.definitions.get(type)
  }

  has(type: string): boolean {
    return this.definitions.has(type)
  }

  entries(): BcFilterDefinition[] {
    return Array.from(this.definitions.values())
  }
}

function serverColumnFilterDefinition(
  type: ServerColumnFilter["type"],
  predicate: (
    value: BcFilterPredicateValue,
    filter: ServerColumnFilter,
    ctx: BcFilterPredicateContext,
  ) => boolean,
  operators: readonly BcFilterOperatorDefinition[],
): BcFilterDefinition {
  return {
    type,
    operators,
    predicate: (value, criteria, ctx) => predicate(value, criteria as ServerColumnFilter, ctx),
    serialize: (filter) => JSON.stringify(filter),
    parse: (serialized) => JSON.parse(serialized) as ServerColumnFilter,
    criteriaFromFilter: (filter) => filter,
  }
}

const textFilterOperators = [
  { op: "contains", label: "Contains", valueShape: "single" },
  { op: "does-not-contain", label: "Does not contain", valueShape: "single" },
  { op: "starts-with", label: "Starts with", valueShape: "single" },
  { op: "ends-with", label: "Ends with", valueShape: "single" },
  { op: "equals", label: "Equals", valueShape: "single" },
  { op: "not-equals", label: "Does not equal", valueShape: "single" },
  { op: "blank", label: "Blank", valueShape: "none" },
  { op: "not-blank", label: "Not blank", valueShape: "none" },
  {
    op: "current-user",
    label: "Current user",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.user.id.",
  },
  {
    op: "current-team",
    label: "Current team",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.user.teamIds.",
  },
] as const satisfies readonly BcFilterOperatorDefinition[]

const numberFilterOperators = [
  { op: "=", label: "Equals", valueShape: "single" },
  { op: "!=", label: "Does not equal", valueShape: "single" },
  { op: "<", label: "Less than", valueShape: "single" },
  { op: "<=", label: "Less than or equal", valueShape: "single" },
  { op: ">", label: "Greater than", valueShape: "single" },
  { op: ">=", label: "Greater than or equal", valueShape: "single" },
  { op: "between", label: "Between", valueShape: "range" },
  { op: "blank", label: "Blank", valueShape: "none" },
  { op: "not-blank", label: "Not blank", valueShape: "none" },
] as const satisfies readonly BcFilterOperatorDefinition[]

const dateFilterOperators = [
  { op: "is", label: "Is", valueShape: "single" },
  { op: "not-equals", label: "Is not", valueShape: "single" },
  { op: "before", label: "Before", valueShape: "single" },
  { op: "after", label: "After", valueShape: "single" },
  { op: "between", label: "Between", valueShape: "range" },
  { op: "today", label: "Today", valueShape: "none" },
  { op: "yesterday", label: "Yesterday", valueShape: "none" },
  { op: "this-week", label: "This week", valueShape: "none" },
  { op: "last-week", label: "Last week", valueShape: "none" },
  { op: "last-n-days", label: "Last N days", valueShape: "integer" },
  { op: "this-month", label: "This month", valueShape: "none" },
  { op: "last-month", label: "Last month", valueShape: "none" },
  {
    op: "this-fiscal-quarter",
    label: "This fiscal quarter",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.fiscalCalendar for non-calendar fiscal years.",
  },
  {
    op: "last-fiscal-quarter",
    label: "Last fiscal quarter",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.fiscalCalendar for non-calendar fiscal years.",
  },
  {
    op: "this-fiscal-year",
    label: "This fiscal year",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.fiscalCalendar for non-calendar fiscal years.",
  },
  {
    op: "last-fiscal-year",
    label: "Last fiscal year",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.fiscalCalendar for non-calendar fiscal years.",
  },
  { op: "blank", label: "Blank", valueShape: "none" },
  { op: "not-blank", label: "Not blank", valueShape: "none" },
] as const satisfies readonly BcFilterOperatorDefinition[]

const setFilterOperators = [
  { op: "in", label: "In", valueShape: "multi" },
  { op: "not-in", label: "Not in", valueShape: "multi" },
  { op: "blank", label: "Blank", valueShape: "none" },
  { op: "not-blank", label: "Not blank", valueShape: "none" },
  {
    op: "current-user",
    label: "Current user",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.user.id.",
  },
  {
    op: "current-team",
    label: "Current team",
    valueShape: "context",
    serverHint: "Requires BcFilterPredicateContext.user.teamIds.",
  },
] as const satisfies readonly BcFilterOperatorDefinition[]

const booleanFilterOperators = [
  { op: "is", label: "Is", valueShape: "single" },
  { op: "blank", label: "Blank", valueShape: "none" },
  { op: "not-blank", label: "Not blank", valueShape: "none" },
] as const satisfies readonly BcFilterOperatorDefinition[]

export const textFilter = serverColumnFilterDefinition(
  "text",
  matchesTextFilter,
  textFilterOperators,
)
export const numberFilter = serverColumnFilterDefinition(
  "number",
  matchesNumberFilter,
  numberFilterOperators,
)
export const numberRangeFilter = serverColumnFilterDefinition(
  "number-range",
  matchesNumberFilter,
  numberFilterOperators,
)
export const dateFilter = serverColumnFilterDefinition(
  "date",
  matchesDateFilter,
  dateFilterOperators,
)
export const dateRangeFilter = serverColumnFilterDefinition(
  "date-range",
  matchesDateFilter,
  dateFilterOperators,
)
export const setFilter = serverColumnFilterDefinition("set", matchesSetFilter, setFilterOperators)
export const booleanFilter = serverColumnFilterDefinition(
  "boolean",
  matchesBooleanFilter,
  booleanFilterOperators,
)

export const builtinFilterDefinitions = [
  textFilter,
  numberFilter,
  numberRangeFilter,
  dateFilter,
  dateRangeFilter,
  setFilter,
  booleanFilter,
] as const

export function createFilterRegistry(
  definitions: readonly BcFilterDefinition[] = builtinFilterDefinitions,
): BcFilterRegistry {
  return new BcDefaultFilterRegistry(definitions)
}

export const filterRegistry = createFilterRegistry()

export function registerFilter(definition: BcFilterDefinition): void {
  filterRegistry.register(definition)
}

export function getFilterDefinition(type: string): BcFilterDefinition | undefined {
  return filterRegistry.get(type)
}

export function columnFilterFromSerializedCriteria({
  columnId,
  serialized,
  type,
  registry = filterRegistry,
}: {
  columnId: ColumnId
  serialized: string
  type: string
  registry?: BcFilterRegistry
}): ServerColumnFilter | null {
  const definition = registry.get(type)
  if (!definition) return null
  const criteria = definition.parse(serialized)
  if (criteria == null) return null
  const draft = definition.filterFromCriteria?.(criteria) ?? { op: "custom", value: criteria }
  if (!draft || typeof draft.op !== "string" || draft.op.length === 0) return null
  return {
    ...draft,
    kind: "column",
    columnId,
    type: type as ServerColumnFilter["type"],
  }
}

export function serializeColumnFilterCriteria(
  filter: ServerColumnFilter,
  registry: BcFilterRegistry = filterRegistry,
): string | undefined {
  const definition = registry.get(filter.type)
  if (!definition) return undefined
  const criteria = definition.criteriaFromFilter
    ? definition.criteriaFromFilter(filter)
    : filter.value
  return definition.serialize(criteria)
}

export function matchesColumnFilter(
  cellValue: BcFilterCellValue,
  filter: ServerColumnFilter,
  options: MatchesFilterOptions = {},
): boolean {
  const registry = options.registry ?? filterRegistry
  const definition = registry.get(filter.type)
  if (!definition) {
    options.onUnknownFilter?.(filter.type, filter)
    return false
  }
  const value = normaliseFilterCellValue(cellValue)
  const criteria = definition.criteriaFromFilter
    ? definition.criteriaFromFilter(filter)
    : filter.value
  return definition.predicate(value, criteria, options.context ?? {})
}

export function matchesFilter(
  filter: ServerFilter,
  valueByColumnId: (columnId: ColumnId) => BcFilterCellValue,
  options: MatchesFilterOptions = {},
): boolean {
  if (filter.kind === "column") {
    return matchesColumnFilter(valueByColumnId(filter.columnId), filter, options)
  }
  if (filter.op === "and") {
    return filter.filters.every((child) => matchesFilter(child, valueByColumnId, options))
  }
  return filter.filters.some((child) => matchesFilter(child, valueByColumnId, options))
}

function normaliseFilterCellValue(value: BcFilterCellValue): BcFilterPredicateValue {
  return typeof value === "string" ? { formattedValue: value } : value
}

function matchesBooleanFilter(value: BcFilterPredicateValue, filter: ServerColumnFilter): boolean {
  if (filter.op === "blank") return isBlankFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(value)
  if (filter.op !== "is") return false
  const actual = parseFormattedBoolean(value.formattedValue)
  return actual != null && actual === Boolean(filter.value)
}

function matchesTextFilter(
  value: BcFilterPredicateValue,
  filter: ServerColumnFilter,
  ctx: BcFilterPredicateContext,
): boolean {
  if (filter.op === "blank") return isBlankFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(value)
  if (filter.op === "current-user") return valueMatchesCurrentUser(value, ctx)
  if (filter.op === "current-team") return valueMatchesCurrentTeam(value, ctx)
  const formattedValue = value.formattedValue
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
  if (filter.op === "starts-with") return haystack.startsWith(needle)
  if (filter.op === "ends-with") return haystack.endsWith(needle)
  if (filter.op === "equals") return haystack === needle
  if (filter.op === "not-equals") return haystack !== needle
  if (filter.op === "contains") return haystack.includes(needle)
  if (filter.op === "does-not-contain") return !haystack.includes(needle)
  return false
}

function matchesDateFilter(
  value: BcFilterPredicateValue,
  filter: ServerColumnFilter,
  ctx: BcFilterPredicateContext,
): boolean {
  if (filter.op === "blank") return isBlankFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(value)
  const actual = parseFilterDate(value.rawValue) ?? parseFilterDate(value.formattedValue)
  if (!actual) return false

  const relativeRange = resolveDateOperatorRange(filter, ctx)
  if (relativeRange) return actual >= relativeRange.start && actual <= relativeRange.end

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
  value: BcFilterPredicateValue,
  filter: ServerColumnFilter,
  ctx: BcFilterPredicateContext,
): boolean {
  if (filter.op === "blank") return isBlankSetFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankSetFilterCellValue(value)
  if (filter.op === "current-user") return valueMatchesCurrentUser(value, ctx)
  if (filter.op === "current-team") return valueMatchesCurrentTeam(value, ctx)

  const selected = new Set((filter.values ?? []).flatMap(setFilterValueKeys))
  if (selected.size === 0) return true

  const candidates = setFilterCandidateValues(value)
  const hasMatch = candidates.some((candidate) => selected.has(candidate))
  if (filter.op === "in") return hasMatch
  if (filter.op === "not-in") return !hasMatch
  return false
}

function matchesNumberFilter(value: BcFilterPredicateValue, filter: ServerColumnFilter): boolean {
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

function parseFormattedBoolean(value: string): boolean | null {
  const normalised = value.trim().toLowerCase()
  if (normalised === "yes" || normalised === "true" || normalised === "1") return true
  if (normalised === "no" || normalised === "false" || normalised === "0") return false
  return null
}

function parseFormattedNumber(value: string): number | null {
  const cleaned = value.trim().replace(/[^0-9.+\-Ee]/g, "")
  return parseFilterNumber(cleaned)
}

function parseFilterNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
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
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.valueOf())) return null
  return toDateInputValue(parsed)
}

interface DateRange {
  start: string
  end: string
}

const DAY_MS = 86_400_000

function resolveDateOperatorRange(
  filter: ServerColumnFilter,
  ctx: BcFilterPredicateContext,
): DateRange | null {
  const today = parseFilterDate(ctx.now) ?? toDateInputValue(new Date())
  const todayDay = isoDateToDay(today)
  if (todayDay == null) return null

  if (filter.op === "today") return oneDayRange(todayDay)
  if (filter.op === "yesterday") return oneDayRange(todayDay - 1)
  if (filter.op === "this-week") {
    const start = startOfWeek(todayDay, ctx.weekStartsOn ?? 1)
    return { start: dayToIsoDate(start), end: dayToIsoDate(start + 6) }
  }
  if (filter.op === "last-week") {
    const thisWeekStart = startOfWeek(todayDay, ctx.weekStartsOn ?? 1)
    return { start: dayToIsoDate(thisWeekStart - 7), end: dayToIsoDate(thisWeekStart - 1) }
  }
  if (filter.op === "last-n-days") {
    const count = parsePositiveInteger(filter.value ?? filter.values?.[0])
    if (count == null) return null
    return { start: dayToIsoDate(todayDay - count + 1), end: dayToIsoDate(todayDay) }
  }
  if (filter.op === "this-month") {
    const parts = isoDateParts(today)
    if (!parts) return null
    return monthRange(parts.year, parts.month)
  }
  if (filter.op === "last-month") {
    const parts = isoDateParts(today)
    if (!parts) return null
    const lastMonth = addMonths(dayFromParts(parts.year, parts.month, 1), -1)
    const lastParts = isoDateParts(dayToIsoDate(lastMonth))
    return lastParts ? monthRange(lastParts.year, lastParts.month) : null
  }
  if (filter.op === "this-fiscal-year") return fiscalYearRange(todayDay, ctx.fiscalCalendar)
  if (filter.op === "last-fiscal-year") {
    const current = fiscalYearRange(todayDay, ctx.fiscalCalendar)
    if (!current) return null
    const currentStart = isoDateToDay(current.start)
    if (currentStart == null) return null
    const start = addMonths(currentStart, -12)
    return { start: dayToIsoDate(start), end: dayToIsoDate(currentStart - 1) }
  }
  if (filter.op === "this-fiscal-quarter") return fiscalQuarterRange(todayDay, ctx.fiscalCalendar)
  if (filter.op === "last-fiscal-quarter") {
    const current = fiscalQuarterRange(todayDay, ctx.fiscalCalendar)
    if (!current) return null
    const currentStart = isoDateToDay(current.start)
    if (currentStart == null) return null
    const start = addMonths(currentStart, -3)
    return { start: dayToIsoDate(start), end: dayToIsoDate(currentStart - 1) }
  }
  return null
}

function oneDayRange(day: number): DateRange {
  const iso = dayToIsoDate(day)
  return { start: iso, end: iso }
}

function startOfWeek(
  day: number,
  weekStartsOn: NonNullable<BcFilterPredicateContext["weekStartsOn"]>,
): number {
  const date = new Date(day * DAY_MS)
  const weekday = date.getUTCDay()
  const offset = (weekday - weekStartsOn + 7) % 7
  return day - offset
}

function monthRange(year: number, month: number): DateRange {
  const start = dayFromParts(year, month, 1)
  const end = addMonths(start, 1) - 1
  return { start: dayToIsoDate(start), end: dayToIsoDate(end) }
}

function fiscalYearRange(day: number, calendar: BcFiscalCalendar | undefined): DateRange | null {
  const start = fiscalYearStart(day, calendar)
  if (start == null) return null
  return { start: dayToIsoDate(start), end: dayToIsoDate(addMonths(start, 12) - 1) }
}

function fiscalQuarterRange(day: number, calendar: BcFiscalCalendar | undefined): DateRange | null {
  const fiscalStart = fiscalYearStart(day, calendar)
  if (fiscalStart == null) return null
  let quarterStart = fiscalStart
  while (addMonths(quarterStart, 3) <= day) {
    quarterStart = addMonths(quarterStart, 3)
  }
  return { start: dayToIsoDate(quarterStart), end: dayToIsoDate(addMonths(quarterStart, 3) - 1) }
}

function fiscalYearStart(day: number, calendar: BcFiscalCalendar | undefined): number | null {
  const parts = isoDateParts(dayToIsoDate(day))
  if (!parts) return null
  const startMonth = clampInteger(calendar?.startMonth, 1, 12) ?? 1
  const startDay = clampInteger(calendar?.startDay, 1, 31) ?? 1
  let start = dayFromParts(parts.year, startMonth, startDay)
  if (start > day) start = dayFromParts(parts.year - 1, startMonth, startDay)
  return start
}

function addMonths(day: number, amount: number): number {
  const parts = isoDateParts(dayToIsoDate(day))
  if (!parts) return day
  const monthIndex = parts.year * 12 + (parts.month - 1) + amount
  const year = Math.floor(monthIndex / 12)
  const month = (monthIndex % 12) + 1
  return dayFromParts(year, month, parts.day)
}

function dayFromParts(year: number, month: number, day: number): number {
  const maxDay = daysInMonth(year, month)
  return Math.floor(Date.UTC(year, month - 1, Math.min(day, maxDay)) / DAY_MS)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isoDateToDay(iso: string): number | null {
  const parts = isoDateParts(iso)
  if (!parts) return null
  return dayFromParts(parts.year, parts.month, parts.day)
}

function dayToIsoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

function isoDateParts(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim())
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

function clampInteger(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null
  return Math.min(max, Math.max(min, value))
}

function valueMatchesCurrentUser(
  value: BcFilterPredicateValue,
  ctx: BcFilterPredicateContext,
): boolean {
  if (ctx.user?.id == null) return false
  return valueMatchesAnyContextKey(value, [ctx.user.id])
}

function valueMatchesCurrentTeam(
  value: BcFilterPredicateValue,
  ctx: BcFilterPredicateContext,
): boolean {
  const teamIds = ctx.user?.teamIds ?? []
  return teamIds.length > 0 && valueMatchesAnyContextKey(value, teamIds)
}

function valueMatchesAnyContextKey(
  value: BcFilterPredicateValue,
  keys: readonly (string | number)[],
): boolean {
  const allowed = new Set(keys.flatMap(setFilterValueKeys))
  if (allowed.size === 0) return false
  return setFilterCandidateValues(value).some((candidate) => allowed.has(candidate))
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function isBlankFilterCellValue(value: BcFilterPredicateValue): boolean {
  if ("rawValue" in value) {
    const raw = value.rawValue
    if (raw == null) return true
    if (typeof raw === "string") return raw.trim().length === 0
    return false
  }
  return value.formattedValue.trim().length === 0
}

function isBlankSetFilterCellValue(value: BcFilterPredicateValue): boolean {
  if ("rawValue" in value) return isBlankSetFilterValue(value.rawValue)
  return value.formattedValue.trim().length === 0
}

function setFilterCandidateValues(value: BcFilterPredicateValue): string[] {
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

export function setFilterValueKey(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) return ""
    return toDateInputValue(value)
  }
  return String(value ?? "")
}

export function setFilterValueKeys(value: unknown): string[] {
  if (Array.isArray(value)) return Array.from(new Set(value.flatMap(setFilterValueKeys)))
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
