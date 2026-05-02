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
 * Group-row checkbox toggle. If every supplied row is already selected,
 * remove the whole set; otherwise add every supplied row. Empty groups
 * are a no-op.
 */
export function toggleRows(selection: BcSelection, rowIds: readonly RowId[]): BcSelection {
  const uniqueRowIds = Array.from(new Set(rowIds))
  if (uniqueRowIds.length === 0) return selection
  const nextSelected = !uniqueRowIds.every((rowId) => isRowSelected(selection, rowId))

  if (selection.mode === "explicit") {
    const next = new Set(selection.rowIds)
    for (const rowId of uniqueRowIds) {
      if (nextSelected) next.add(rowId)
      else next.delete(rowId)
    }
    return { mode: "explicit", rowIds: next }
  }

  const nextExcept = new Set(selection.except)
  for (const rowId of uniqueRowIds) {
    if (nextSelected) nextExcept.delete(rowId)
    else nextExcept.add(rowId)
  }
  if (selection.mode === "all") return { mode: "all", except: nextExcept }
  return { ...selection, except: nextExcept }
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

/**
 * Header-checkbox "select all visible" → an "explicit" selection containing
 * exactly the supplied rows. Used by the selection-checkbox column when the
 * user toggles the master checkbox on while it was off / indeterminate.
 */
export function selectAllRows(rowIds: readonly RowId[]): BcSelection {
  return { mode: "explicit", rowIds: new Set(rowIds) }
}

/**
 * Empty selection. Used by the selection-checkbox column when the user
 * toggles the master checkbox off while everything was selected.
 */
export function clearSelection(): BcSelection {
  return { mode: "explicit", rowIds: new Set<RowId>() }
}

/**
 * Tri-state of the header checkbox over a set of visible rows:
 *   - "all"      every row is selected
 *   - "some"     at least one but not all are selected (indeterminate)
 *   - "none"     no row is selected
 *
 * Operates on "explicit" selections only — "all" / "filtered" modes are
 * conceptually already "select-all" and don't fit the visible-page tri-state
 * contract; they collapse to "all".
 */
export function headerCheckboxState(
  selection: BcSelection,
  visibleRowIds: readonly RowId[],
): "all" | "some" | "none" {
  if (visibleRowIds.length === 0) return "none"
  if (selection.mode !== "explicit") return "all"
  let selectedCount = 0
  for (const id of visibleRowIds) {
    if (selection.rowIds.has(id)) selectedCount++
  }
  if (selectedCount === 0) return "none"
  if (selectedCount === visibleRowIds.length) return "all"
  return "some"
}
