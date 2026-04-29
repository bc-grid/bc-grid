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
 * Toggle sort state for a single column. Cycle: none → asc → desc → none.
 * v0.1 supports single-column sort only — clicking a different column
 * replaces (not stacks) the previous sort. Multi-column sort is a Q2 task.
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
