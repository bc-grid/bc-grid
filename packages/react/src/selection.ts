import type { BcSelection, RowId } from "@bc-grid/core"

/**
 * Selection algebra over `BcSelection` from `@bc-grid/core`. Pure
 * functions, unit-testable without a DOM. The grid's click handler
 * picks the right operation based on modifier keys:
 *
 *   plain click           → selectOnly(rowId)
 *   ctrl/cmd-click        → toggleRow(selection, rowId)
 *   shift-click           → selectRange(rowIds, anchor, current)
 *
 * `BcSelection` has three modes (per api.md §3.2):
 *   - "explicit"  — rowIds is the selected set
 *   - "all"       — every row is selected EXCEPT those in `except`
 *   - "filtered"  — like "all" but scoped to a viewKey
 *
 * Q1 only emits "explicit" via these helpers; "all" / "filtered" come
 * from a future select-all action (Q2 row-selection-bulk task).
 */

export function isRowSelected(selection: BcSelection, rowId: RowId): boolean {
  if (selection.mode === "explicit") return selection.rowIds.has(rowId)
  return !selection.except.has(rowId)
}

/** Click → select only this row, drop all prior selection. */
export function selectOnly(rowId: RowId): BcSelection {
  return { mode: "explicit", rowIds: new Set([rowId]) }
}

/**
 * Ctrl/Cmd-click → flip this row's membership in the current selection.
 * For "all" / "filtered" modes, flips the `except` set (since "selected"
 * means "not excepted" in those modes).
 */
export function toggleRow(selection: BcSelection, rowId: RowId): BcSelection {
  if (selection.mode === "explicit") {
    const next = new Set(selection.rowIds)
    if (next.has(rowId)) next.delete(rowId)
    else next.add(rowId)
    return { mode: "explicit", rowIds: next }
  }
  const next = new Set(selection.except)
  if (next.has(rowId)) next.delete(rowId)
  else next.add(rowId)
  if (selection.mode === "all") return { mode: "all", except: next }
  // "filtered" preserves viewKey
  return { ...selection, except: next }
}

/**
 * Shift-click → range select from `anchor` to `current` inclusive,
 * indexed into the supplied row order. Returns an "explicit" selection
 * containing exactly the rows in the range. If either anchor or current
 * isn't found in `rowIds`, falls back to a single-row selection on
 * `current`.
 */
export function selectRange(rowIds: readonly RowId[], anchor: RowId, current: RowId): BcSelection {
  const anchorIdx = rowIds.indexOf(anchor)
  const currentIdx = rowIds.indexOf(current)
  if (anchorIdx === -1 || currentIdx === -1) {
    return selectOnly(current)
  }
  const lo = Math.min(anchorIdx, currentIdx)
  const hi = Math.max(anchorIdx, currentIdx)
  const ids = new Set<RowId>()
  for (let i = lo; i <= hi; i++) {
    const id = rowIds[i]
    if (id) ids.add(id)
  }
  return { mode: "explicit", rowIds: ids }
}

/**
 * Number of selected rows for an "explicit" selection. Returns
 * `undefined` for "all" / "filtered" since the count depends on the
 * row model the consumer holds.
 */
export function selectionSize(selection: BcSelection): number | undefined {
  if (selection.mode === "explicit") return selection.rowIds.size
  return undefined
}
