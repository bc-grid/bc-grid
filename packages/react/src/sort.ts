import type { BcGridSort, ColumnId } from "@bc-grid/core"

/**
 * Default cell-value comparator. Handles `null` / `undefined` (sorted last
 * regardless of direction), numbers, Dates, booleans, and strings (locale-
 * aware). Falls back to `String(a).localeCompare(String(b))` for mixed or
 * unfamiliar types.
 *
 * Used when a column doesn't supply a custom `comparator`.
 */
export function defaultCompareValues(a: unknown, b: unknown): number {
  if (Object.is(a, b)) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  if (a instanceof Date && b instanceof Date) return a.valueOf() - b.valueOf()
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? 1 : -1
  return String(a).localeCompare(String(b))
}

/**
 * Toggle the primary sort to a single column. Cycle: none → asc → desc → none.
 * Wired to plain header click — replaces any existing multi-column sort.
 */
export function toggleSortFor(
  current: readonly BcGridSort[],
  columnId: ColumnId,
): readonly BcGridSort[] {
  const existing = current.find((s) => s.columnId === columnId)
  if (!existing) return [{ columnId, direction: "asc" }]
  if (existing.direction === "asc") return [{ columnId, direction: "desc" }]
  return []
}

/**
 * Append (or cycle within) a sort key without disturbing existing keys.
 * Wired to Shift+click on a header. `BcGridSort[]` shape already supports
 * multi-column per `api.md §3.2`.
 *
 * - If `columnId` is not in `current`: append `{ columnId, direction: "asc" }`.
 * - If `columnId` is already at direction `asc`: flip the existing entry to
 *   `desc` (preserve its position in the sort order).
 * - If `columnId` is already at direction `desc`: drop it from the array.
 *
 * The cycle keeps a column's position stable so users editing a complex
 * sort don't lose their composition just by adjusting one direction.
 */
export function appendSortFor(
  current: readonly BcGridSort[],
  columnId: ColumnId,
): readonly BcGridSort[] {
  const index = current.findIndex((s) => s.columnId === columnId)
  if (index === -1) return [...current, { columnId, direction: "asc" }]
  const existing = current[index]
  if (!existing) return current
  if (existing.direction === "asc") {
    const next = current.slice()
    next[index] = { columnId, direction: "desc" }
    return next
  }
  return current.filter((s) => s.columnId !== columnId)
}

/**
 * Remove a single column from the sort state. Wired to Ctrl/Cmd+click on a
 * header. Returns `current` unchanged if the column wasn't sorted.
 */
export function removeSortFor(
  current: readonly BcGridSort[],
  columnId: ColumnId,
): readonly BcGridSort[] {
  if (!current.some((s) => s.columnId === columnId)) return current
  return current.filter((s) => s.columnId !== columnId)
}
