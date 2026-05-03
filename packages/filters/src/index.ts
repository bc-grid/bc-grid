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

export interface BcFilterDefinition<TValue = unknown> {
  type: string
  predicate: (value: BcFilterPredicateValue<TValue>, criteria: unknown) => boolean
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
  predicate: (value: BcFilterPredicateValue, filter: ServerColumnFilter) => boolean,
): BcFilterDefinition {
  return {
    type,
    predicate: (value, criteria) => predicate(value, criteria as ServerColumnFilter),
    serialize: (filter) => JSON.stringify(filter),
    parse: (serialized) => JSON.parse(serialized) as ServerColumnFilter,
    criteriaFromFilter: (filter) => filter,
  }
}

export const textFilter = serverColumnFilterDefinition("text", matchesTextFilter)
export const numberFilter = serverColumnFilterDefinition("number", matchesNumberFilter)
export const numberRangeFilter = serverColumnFilterDefinition("number-range", matchesNumberFilter)
export const dateFilter = serverColumnFilterDefinition("date", matchesDateFilter)
export const dateRangeFilter = serverColumnFilterDefinition("date-range", matchesDateFilter)
export const setFilter = serverColumnFilterDefinition("set", matchesSetFilter)
export const booleanFilter = serverColumnFilterDefinition("boolean", matchesBooleanFilter)

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
  return definition.predicate(value, criteria)
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
  if (filter.op !== "is") return false
  const actual = parseFormattedBoolean(value.formattedValue)
  return actual != null && actual === Boolean(filter.value)
}

function matchesTextFilter(value: BcFilterPredicateValue, filter: ServerColumnFilter): boolean {
  if (filter.op === "blank") return isBlankFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(value)
  const formattedValue = value.formattedValue
  const needleRaw = String(filter.value ?? "")
  if (needleRaw.length === 0) return true

  if (filter.regex === true) {
    try {
      const pattern = new RegExp(needleRaw, filter.caseSensitive === true ? "" : "i")
      return pattern.test(formattedValue)
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
  if (filter.op === "contains") return haystack.includes(needle)
  return false
}

function matchesDateFilter(value: BcFilterPredicateValue, filter: ServerColumnFilter): boolean {
  if (filter.op === "blank") return isBlankFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankFilterCellValue(value)
  const actual = parseFilterDate(value.rawValue) ?? parseFilterDate(value.formattedValue)
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

function matchesSetFilter(value: BcFilterPredicateValue, filter: ServerColumnFilter): boolean {
  if (filter.op === "blank") return isBlankSetFilterCellValue(value)
  if (filter.op === "not-blank") return !isBlankSetFilterCellValue(value)

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
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.valueOf())) return null
  return toDateInputValue(parsed)
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
