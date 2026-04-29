import type { BcColumnStateEntry, ColumnId } from "@bc-grid/core"
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
  pageSize?: number | undefined
  density?: BcGridDensity | undefined
  groupBy?: readonly ColumnId[] | undefined
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
    pageSize: readJson(storage, gridStorageKey(gridId, "pageSize"), parsePageSize),
    density: readJson(storage, gridStorageKey(gridId, "density"), parseDensity),
    groupBy: readJson(storage, gridStorageKey(gridId, "groupBy"), parseGroupBy),
  }
}

export function writePersistedGridState(
  gridId: string | undefined,
  state: PersistedGridState,
  storage = getDefaultStorage(),
): void {
  if (!gridId || !storage) return

  writeJson(storage, gridStorageKey(gridId, "columnState"), state.columnState)
  writeJson(storage, gridStorageKey(gridId, "pageSize"), state.pageSize)
  writeJson(storage, gridStorageKey(gridId, "density"), state.density)
  writeJson(storage, gridStorageKey(gridId, "groupBy"), state.groupBy)
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

function getDefaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
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
  assignPositiveNumber(entry, "flex", value.flex)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function assignPositiveNumber(
  entry: BcColumnStateEntry,
  key: "width" | "flex",
  value: unknown,
): void {
  if (isPositiveNumber(value)) entry[key] = value
}

function assignNonNegativeNumber(entry: BcColumnStateEntry, key: "position", value: unknown): void {
  if (isNonNegativeNumber(value)) entry[key] = value
}

function assignBoolean(entry: BcColumnStateEntry, key: "hidden", value: unknown): void {
  if (typeof value === "boolean") entry[key] = value
}
