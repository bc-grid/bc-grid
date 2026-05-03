import type {
  BcAggregation,
  BcColumnStateEntry,
  BcGridFilter,
  BcGridSort,
  BcPivotState,
  BcPivotValue,
  ColumnId,
  ServerColumnFilter,
  ServerFilter,
} from "@bc-grid/core"
import { useEffect } from "react"
import type { BcGridDensity } from "./types"

export const GRID_STATE_WRITE_DEBOUNCE_MS = 500

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface PersistedGridState {
  columnState?: readonly BcColumnStateEntry[] | undefined
  sort?: readonly BcGridSort[] | undefined
  pageSize?: number | undefined
  density?: BcGridDensity | undefined
  groupBy?: readonly ColumnId[] | undefined
  pivotState?: BcPivotState | undefined
  filter?: BcGridFilter | undefined
  sidebarPanel?: string | null | undefined
}

export interface UrlStatePersistenceOptions {
  searchParam: string
}

export interface UrlPersistedGridState {
  columnState?: readonly BcColumnStateEntry[] | undefined
  sort?: readonly BcGridSort[] | undefined
  filter?: BcGridFilter | undefined
}

export interface LocationLike {
  pathname: string
  search: string
  hash: string
}

export interface HistoryLike {
  state?: unknown
  replaceState(state: unknown, unused: string, url?: string | URL | null): void
}

export function gridStorageKey(gridId: string, state: keyof PersistedGridState): string {
  return `bc-grid:${gridId}:${state}`
}

export function readPersistedGridState(
  gridId: string | undefined,
  storage = getDefaultStorage(),
): PersistedGridState {
  if (!gridId || !storage) return {}

  return {
    columnState: readJson(storage, gridStorageKey(gridId, "columnState"), parseColumnState),
    sort: readJson(storage, gridStorageKey(gridId, "sort"), parseSortState),
    pageSize: readJson(storage, gridStorageKey(gridId, "pageSize"), parsePageSize),
    density: readJson(storage, gridStorageKey(gridId, "density"), parseDensity),
    groupBy: readJson(storage, gridStorageKey(gridId, "groupBy"), parseGroupBy),
    pivotState: readJson(storage, gridStorageKey(gridId, "pivotState"), parsePivotState),
    filter: readJson(storage, gridStorageKey(gridId, "filter"), parseFilterState),
    sidebarPanel: readJson(storage, gridStorageKey(gridId, "sidebarPanel"), parseSidebarPanel),
  }
}

export function writePersistedGridState(
  gridId: string | undefined,
  state: PersistedGridState,
  storage = getDefaultStorage(),
): void {
  if (!gridId || !storage) return

  writeJson(storage, gridStorageKey(gridId, "columnState"), state.columnState)
  writeJson(storage, gridStorageKey(gridId, "sort"), state.sort)
  writeJson(storage, gridStorageKey(gridId, "pageSize"), state.pageSize)
  writeJson(storage, gridStorageKey(gridId, "density"), state.density)
  writeJson(storage, gridStorageKey(gridId, "groupBy"), state.groupBy)
  writeJson(storage, gridStorageKey(gridId, "pivotState"), state.pivotState)
  writeJson(storage, gridStorageKey(gridId, "filter"), state.filter)
  writeJson(storage, gridStorageKey(gridId, "sidebarPanel"), state.sidebarPanel)
}

export function readUrlPersistedGridState(
  options: UrlStatePersistenceOptions | undefined,
  location = getDefaultLocation(),
): UrlPersistedGridState {
  const searchParam = validSearchParam(options?.searchParam)
  if (!searchParam || !location) return {}

  try {
    const raw = new URLSearchParams(location.search).get(searchParam)
    if (raw == null) return {}
    return parseUrlPersistedGridState(JSON.parse(raw)) ?? {}
  } catch {
    return {}
  }
}

export function writeUrlPersistedGridState(
  options: UrlStatePersistenceOptions | undefined,
  state: UrlPersistedGridState,
  history = getDefaultHistory(),
  location = getDefaultLocation(),
): void {
  const searchParam = validSearchParam(options?.searchParam)
  if (!searchParam || !history || !location) return

  try {
    const params = new URLSearchParams(location.search)
    if (state.columnState === undefined && state.sort === undefined && state.filter === undefined) {
      params.delete(searchParam)
    } else {
      params.set(searchParam, JSON.stringify(state))
    }

    const query = params.toString()
    const nextUrl = `${location.pathname}${query ? `?${query}` : ""}${location.hash}`
    history.replaceState(history.state ?? null, "", nextUrl)
  } catch {
    // URL persistence is best-effort; history/security failures must not break the grid.
  }
}

export function prunePersistedGridStateForColumns(
  state: PersistedGridState,
  columnIds: ReadonlySet<ColumnId>,
): PersistedGridState {
  const next: PersistedGridState = {
    ...state,
    columnState: pruneColumnStateForColumns(state.columnState, columnIds),
    filter: pruneFilterForColumns(state.filter, columnIds),
    groupBy: pruneGroupByForColumns(state.groupBy, columnIds),
    pivotState: prunePivotStateForColumns(state.pivotState, columnIds),
    sort: pruneSortForColumns(state.sort, columnIds),
  }
  return next
}

export function pruneUrlPersistedGridStateForColumns(
  state: UrlPersistedGridState,
  columnIds: ReadonlySet<ColumnId>,
): UrlPersistedGridState {
  return {
    ...state,
    columnState: pruneColumnStateForColumns(state.columnState, columnIds),
    filter: pruneFilterForColumns(state.filter, columnIds),
    sort: pruneSortForColumns(state.sort, columnIds),
  }
}

export function usePersistedGridStateWriter(gridId: string | undefined, state: PersistedGridState) {
  useEffect(() => {
    if (!gridId) return

    const handle = setTimeout(() => {
      writePersistedGridState(gridId, state)
    }, GRID_STATE_WRITE_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [gridId, state])
}

export function useUrlPersistedGridStateWriter(
  options: UrlStatePersistenceOptions | undefined,
  state: UrlPersistedGridState,
) {
  const searchParam = validSearchParam(options?.searchParam)

  useEffect(() => {
    if (!searchParam) return

    const handle = setTimeout(() => {
      writeUrlPersistedGridState({ searchParam }, state)
    }, GRID_STATE_WRITE_DEBOUNCE_MS)

    return () => clearTimeout(handle)
  }, [searchParam, state])
}

function pruneColumnStateForColumns(
  columnState: readonly BcColumnStateEntry[] | undefined,
  columnIds: ReadonlySet<ColumnId>,
): BcColumnStateEntry[] | undefined {
  if (columnState === undefined) return undefined
  const seen = new Set<ColumnId>()
  return columnState.flatMap((entry) => {
    if (!columnIds.has(entry.columnId) || seen.has(entry.columnId)) return []
    seen.add(entry.columnId)
    return [{ ...entry }]
  })
}

function pruneSortForColumns(
  sort: readonly BcGridSort[] | undefined,
  columnIds: ReadonlySet<ColumnId>,
): BcGridSort[] | undefined {
  if (sort === undefined) return undefined
  return sort.flatMap((entry) => {
    if (!columnIds.has(entry.columnId)) return []
    return entry.direction === "asc" || entry.direction === "desc" ? [{ ...entry }] : []
  })
}

function pruneGroupByForColumns(
  groupBy: readonly ColumnId[] | undefined,
  columnIds: ReadonlySet<ColumnId>,
): ColumnId[] | undefined {
  if (groupBy === undefined) return undefined
  return groupBy.filter((columnId) => columnIds.has(columnId))
}

function prunePivotStateForColumns(
  pivotState: BcPivotState | undefined,
  columnIds: ReadonlySet<ColumnId>,
): BcPivotState | undefined {
  if (pivotState === undefined) return undefined
  return {
    ...pivotState,
    colGroups: pivotState.colGroups.filter((columnId) => columnIds.has(columnId)),
    rowGroups: pivotState.rowGroups.filter((columnId) => columnIds.has(columnId)),
    values: pivotState.values.filter((value) => columnIds.has(value.columnId)),
  }
}

function pruneFilterForColumns(
  filter: BcGridFilter | undefined,
  columnIds: ReadonlySet<ColumnId>,
): BcGridFilter | undefined {
  if (filter === undefined) return undefined
  if (filter.kind === "column") return columnIds.has(filter.columnId) ? { ...filter } : undefined

  const filters = filter.filters.flatMap((child) => {
    const next = pruneFilterForColumns(child, columnIds)
    return next ? [next] : []
  })
  return filters.length > 0 ? { ...filter, filters } : undefined
}

function getDefaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function getDefaultLocation(): LocationLike | undefined {
  try {
    return globalThis.location
  } catch {
    return undefined
  }
}

function getDefaultHistory(): HistoryLike | undefined {
  try {
    return globalThis.history
  } catch {
    return undefined
  }
}

function validSearchParam(searchParam: string | undefined): string | undefined {
  const trimmed = searchParam?.trim()
  return trimmed ? trimmed : undefined
}

function readJson<T>(
  storage: StorageLike,
  key: string,
  parse: (value: unknown) => T | undefined,
): T | undefined {
  try {
    const raw = storage.getItem(key)
    if (raw == null) return undefined
    return parse(JSON.parse(raw))
  } catch {
    return undefined
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown): void {
  try {
    if (value === undefined) {
      storage.removeItem(key)
      return
    }
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is best-effort; quota/security failures must not break the grid.
  }
}

function parseColumnState(value: unknown): BcColumnStateEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((entry) => {
    const parsed = parseColumnStateEntry(entry)
    return parsed ? [parsed] : []
  })
}

function parseColumnStateEntry(value: unknown): BcColumnStateEntry | undefined {
  if (!isRecord(value) || typeof value.columnId !== "string" || value.columnId.length === 0) {
    return undefined
  }

  const entry: BcColumnStateEntry = { columnId: value.columnId }
  assignPositiveNumber(entry, "width", value.width)
  assignFlex(entry, value.flex)
  assignNonNegativeNumber(entry, "position", value.position)
  assignBoolean(entry, "hidden", value.hidden)

  if (value.pinned === "left" || value.pinned === "right" || value.pinned === null) {
    entry.pinned = value.pinned
  }
  if (
    value.sortDirection === "asc" ||
    value.sortDirection === "desc" ||
    value.sortDirection === null
  ) {
    entry.sortDirection = value.sortDirection
  }
  if (isNonNegativeNumber(value.sortIndex) || value.sortIndex === null) {
    entry.sortIndex = value.sortIndex
  }

  return entry
}

function parseUrlPersistedGridState(value: unknown): UrlPersistedGridState | undefined {
  if (!isRecord(value)) return undefined
  const columnState = parseColumnState(value.columnState)
  const sort = parseSortState(value.sort)
  const filter = parseFilterState(value.filter)
  const state: UrlPersistedGridState = {}
  if (columnState) state.columnState = columnState
  if (sort) state.sort = sort
  if (filter) state.filter = filter
  return state
}

function parseSortState(value: unknown): BcGridSort[] | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed = value.flatMap((entry) => {
    const parsed = parseSortEntry(entry)
    return parsed ? [parsed] : []
  })
  return parsed.length > 0 || value.length === 0 ? parsed : undefined
}

function parseSortEntry(value: unknown): BcGridSort | undefined {
  if (
    !isRecord(value) ||
    typeof value.columnId !== "string" ||
    value.columnId.length === 0 ||
    (value.direction !== "asc" && value.direction !== "desc")
  ) {
    return undefined
  }
  return { columnId: value.columnId, direction: value.direction }
}

function parseFilterState(value: unknown): BcGridFilter | undefined {
  return parseServerFilter(value)
}

function parseServerFilter(value: unknown): ServerFilter | undefined {
  if (!isRecord(value)) return undefined

  if (value.kind === "group") {
    if ((value.op !== "and" && value.op !== "or") || !Array.isArray(value.filters)) {
      return undefined
    }
    const filters = value.filters.flatMap((filter) => {
      const parsed = parseServerFilter(filter)
      return parsed ? [parsed] : []
    })
    return filters.length > 0 ? { kind: "group", op: value.op, filters } : undefined
  }

  if (value.kind !== "column") return undefined
  if (
    typeof value.columnId !== "string" ||
    value.columnId.length === 0 ||
    !isColumnFilterType(value.type) ||
    typeof value.op !== "string" ||
    value.op.length === 0
  ) {
    return undefined
  }

  const filter: ServerColumnFilter = {
    kind: "column",
    columnId: value.columnId,
    type: value.type,
    op: value.op,
  }
  if ("value" in value) filter.value = value.value
  if (Array.isArray(value.values)) filter.values = [...value.values]
  return filter
}

function parsePageSize(value: unknown): number | undefined {
  return Number.isInteger(value) && typeof value === "number" && value > 0 ? value : undefined
}

function parseDensity(value: unknown): BcGridDensity | undefined {
  return value === "compact" || value === "normal" || value === "comfortable" ? value : undefined
}

function parseGroupBy(value: unknown): ColumnId[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.every((columnId) => typeof columnId === "string") ? value : undefined
}

function parsePivotState(value: unknown): BcPivotState | undefined {
  if (!isRecord(value)) return undefined
  const rowGroups = parseGroupBy(value.rowGroups)
  const colGroups = parseGroupBy(value.colGroups)
  const values = parsePivotValues(value.values)
  if (!rowGroups || !colGroups || !values) return undefined

  const state: BcPivotState = { rowGroups, colGroups, values }
  const subtotals = parsePivotSubtotals(value.subtotals)
  if (subtotals) state.subtotals = subtotals
  return state
}

function parsePivotValues(value: unknown): BcPivotValue[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((entry) => {
    const parsed = parsePivotValue(entry)
    return parsed ? [parsed] : []
  })
}

function parsePivotValue(value: unknown): BcPivotValue | undefined {
  if (!isRecord(value) || typeof value.columnId !== "string" || value.columnId.length === 0) {
    return undefined
  }

  const entry: BcPivotValue = { columnId: value.columnId }
  const aggregation = parsePivotAggregation(value.aggregation)
  if (aggregation) entry.aggregation = aggregation
  if (typeof value.label === "string" && value.label.trim()) entry.label = value.label
  return entry
}

function parsePivotAggregation(value: unknown): BcAggregation | undefined {
  if (!isRecord(value)) return undefined
  return isBuiltInAggregationType(value.type) ? { type: value.type } : undefined
}

function parsePivotSubtotals(value: unknown): BcPivotState["subtotals"] | undefined {
  if (!isRecord(value)) return undefined
  const subtotals: NonNullable<BcPivotState["subtotals"]> = {}
  if (typeof value.rows === "boolean") subtotals.rows = value.rows
  if (typeof value.cols === "boolean") subtotals.cols = value.cols
  return "rows" in subtotals || "cols" in subtotals ? subtotals : undefined
}

function parseSidebarPanel(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function isColumnFilterType(value: unknown): value is ServerColumnFilter["type"] {
  return typeof value === "string" && value.length > 0
}

function isBuiltInAggregationType(
  value: unknown,
): value is Exclude<BcAggregation["type"], "custom"> {
  return (
    value === "sum" || value === "count" || value === "avg" || value === "min" || value === "max"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function assignPositiveNumber(entry: BcColumnStateEntry, key: "width", value: unknown): void {
  if (isPositiveNumber(value)) entry[key] = value
}

function assignFlex(entry: BcColumnStateEntry, value: unknown): void {
  if (value === null) {
    entry.flex = null
    return
  }
  if (isPositiveNumber(value)) entry.flex = value
}

function assignNonNegativeNumber(entry: BcColumnStateEntry, key: "position", value: unknown): void {
  if (isNonNegativeNumber(value)) entry[key] = value
}

function assignBoolean(entry: BcColumnStateEntry, key: "hidden", value: unknown): void {
  if (typeof value === "boolean") entry[key] = value
}
